import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
  // Sits above `admin`: manages federations and appoints/removes the
  // federation admins themselves. Nothing in the federation console runs at
  // this level — it is a platform governance tier, not an operations one.
  SUPERADMIN: "superadmin",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
  v.literal(ROLES.SUPERADMIN),
);

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      // Phone identity. These are NOT in the override by accident: redefining
      // `users` here replaces the whole table from `...authTables`, so omitting
      // them drops the columns and the `by_phone` index that Convex Auth's
      // `Phone` provider needs to look an account up. Gig workers sign in by
      // phone, so both are load-bearing.
      phone: v.optional(v.string()), // do not remove
      phoneVerificationTime: v.optional(v.number()), // do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // role of the user. do not remove

      // For federation admins: the one society (federation) whose workers they
      // may govern. Absent for ordinary members and super admins, whose view
      // spans every federation.
      societyId: v.optional(v.id("societies")),

      // Safety Mode — a customer-side preference, not an identity claim. When on,
      // the customer only ever sees fully verified workers and their exact
      // address stays hidden from the worker until they set off.
      safetyMode: v.optional(v.boolean()),
    })
      .index("email", ["email"]) // index for the email. do not remove or modify
      .index("phone", ["phone"]), // index for the phone. do not remove or modify

    // add other tables here

    // Sahakar Seva v1 — artisan profiles, verification state and live telemetry
    artisans: defineTable({
      userId: v.id("users"), // owner of this artisan record

      // STEP 1 — Trade profile
      fullName: v.string(),
      phone: v.string(),
      trade: v.string(), // trade id, see src/lib/trades.ts
      district: v.string(),
      state: v.string(),
      societyId: v.string(),
      experienceYears: v.number(),
      dailyRate: v.number(), // union standard base day rate (INR)
      upiVpa: v.optional(v.string()), // zero-commission direct settlement VPA

      // STEP 2 — Identity & police clearance (KYC)
      idType: v.string(), // "aadhaar" | "voter"
      idLast4: v.string(),
      kycStatus: v.string(), // "pending" | "verified" | "rejected"
      kycVerifiedAt: v.optional(v.number()),
      kycRef: v.optional(v.string()), // background verification reference

      // STEP 3 — Voice skill quiz -> digital cooperative trade credential
      quizPassed: v.boolean(),
      quizScore: v.optional(v.number()), // 0..100
      quizTakenAt: v.optional(v.number()),
      credentialId: v.optional(v.string()), // SSC-YYYY-XXXX
      credentialIssuedAt: v.optional(v.number()),

      // STEP 4 — operational state
      isOnline: v.boolean(),
      // Coarse working slots, as bit flags over the 7 days of the coming week.
      // 1 = available. Deliberately coarse: a household books "Thursday
      // evening", not an instant, and a fine-grained calendar is a lie about
      // what a worker walking between three jobs can actually promise.
      slots: v.optional(v.number()),
      lat: v.optional(v.number()),
      lng: v.optional(v.number()),
      telemetryAt: v.optional(v.number()), // last GPS ping

      // Admin removal — soft-delete so history/ledger stay intact.
      removedAt: v.optional(v.number()),
      removedBy: v.optional(v.id("users")),
      removalNote: v.optional(v.string()),

      // Reputation — denormalised from the `reviews` table on every write so the
      // public directory can sort by rating without a fan-out join.
      ratingAvg: v.optional(v.number()), // 1..5, mean of all reviews
      ratingCount: v.optional(v.number()),

      // Swap Service — how often this worker stood down and handed a job back to
      // the pool. Tracked, never punished: it is a signal for the board, not a
      // score.
      declinedSwaps: v.optional(v.number()),

      // Skill verification — set by the board after reviewing work evidence.
      skillStatus: v.optional(v.string()), // "pending" | "verified" | "rejected"
      skillVerifiedAt: v.optional(v.number()),
      skillRef: v.optional(v.string()),

      // cooperative ledger (v1 display only)
      welfareBalance: v.number(),
      dividendBalance: v.number(),

      createdAt: v.number(),
    })
      .index("by_userId", ["userId"])
      .index("by_trade", ["trade"])
      .index("by_kyc", ["kycStatus"])
      .index("by_slots", ["slots"]),

    // Customer bookings — full lifecycle dispatch
    bookings: defineTable({
      customerId: v.id("users"),
      serviceId: v.string(),
      trade: v.string(),
      serviceName: v.string(), // denormalized for listings
      address: v.string(),
      lat: v.optional(v.number()),
      lng: v.optional(v.number()),
      scheduledFor: v.number(),
      urgent: v.boolean(),
      notes: v.optional(v.string()),
      welfareOptIn: v.boolean(),
      base: v.number(),
      hourly: v.number(),
      welfareAmt: v.number(), // 7% welfare share (ledger)
      opsAmt: v.number(), // 3% operational cost share (ledger)
      workerShare: v.number(), // 90% worker payout
      total: v.number(),
      status: v.string(), // pending|accepted|enroute|inprogress|payment|completed|settled|cancelled
      customServiceId: v.optional(v.id("customServices")), // set when the booked work is a worker-created listing
      // Shared booking — one group visit, several households. `base`/`total` stay
      // the full job price the worker is paid; `shareAmount` is this
      // customer's slice of it.
      groupId: v.optional(v.id("bookingGroups")),
      shareCount: v.optional(v.number()), // households sharing this visit
      shareAmount: v.optional(v.number()), // total / shareCount
      participantPaid: v.optional(v.boolean()),
      // Swap Service — set when the customer asks for a different worker. The
      // booking stays live; it is re-offered to the pool.
      swapRequestedAt: v.optional(v.number()),
      swapCount: v.optional(v.number()),
      originalWorkerId: v.optional(v.id("artisans")), // stood down by a swap, restorable if nobody claims it
      // Emergency Quick Help — a broadcast job, pinned to the top of the radar
      // and rate limited far more tightly than a normal booking.
      emergency: v.optional(v.boolean()),
      workerId: v.optional(v.id("artisans")), // assigned on accept
      workerUserId: v.optional(v.id("users")),
      workerVpa: v.optional(v.string()), // worker's own UPI id — funds go straight to them
      acceptedAt: v.optional(v.number()),
      utr: v.optional(v.string()), // UPI transaction reference
      // How the booking got paid. `paymentMethod` keeps the ledger honest:
      // direct UPI with a customer-submitted reference is the one rail.
      paymentMethod: v.optional(v.string()), // always "upi_manual"
      paidAt: v.optional(v.number()),
      settledAt: v.optional(v.number()),
      cancelledAt: v.optional(v.number()),
      cancelBy: v.optional(v.string()), // "customer" | "worker" | "admin"
      createdAt: v.number(),
    })
      .index("by_customer", ["customerId"])
      .index("by_worker", ["workerUserId"])
      .index("by_status", ["status"])
      .index("by_created", ["createdAt"])
      .index("by_group", ["groupId"]),

    // Shared ("group") bookings — the cooperative cost-split. Several nearby
    // households agree on one visit for one service in one window, and the
    // worker does one job instead of three. A group only becomes real work when
    // it fills (maxShares reached); the worker price is unchanged, so the
    // federation's 90/7/3 split is applied to the full amount, once.
    bookingGroups: defineTable({
      serviceId: v.string(),
      customServiceId: v.optional(v.id("customServices")),
      trade: v.string(),
      serviceName: v.string(),
      lat: v.optional(v.number()), // neighbourhood centroid
      lng: v.optional(v.number()),
      radiusM: v.number(), // how far a household may be and still share
      windowStart: v.number(),
      windowEnd: v.number(),
      maxShares: v.number(), // 2..4 households
      status: v.string(), // "open" | "full" | "dispatched" | "expired" | "cancelled"
      note: v.optional(v.string()),
      createdBy: v.id("users"),
      createdAt: v.number(),
    })
      .index("by_status", ["status"])
      .index("by_trade", ["trade"])
      .index("by_creator", ["createdBy"]),

    // Customer reputation — the second half of the trust story. Verification says
    // "this worker is who they claim to be"; a review says "they did the work
    // well". One review per completed booking, enforced in the mutation.
    reviews: defineTable({
      bookingId: v.id("bookings"), // the completed booking this is anchored to
      customerId: v.id("users"),
      artisanId: v.id("artisans"),
      rating: v.number(), // 1..5
      comment: v.optional(v.string()),
      tags: v.optional(v.array(v.string())), // on_time | clean_work | fair_price | polite
      createdAt: v.number(),
    })
      .index("by_artisan", ["artisanId"])
      .index("by_booking", ["bookingId"])
      .index("by_customer", ["customerId"]),

    // District cooperative societies — formal registration pipeline
    societies: defineTable({
      name: v.string(),
      district: v.string(),
      state: v.string(),
      code: v.string(), // e.g. TS-HYD-13 (state-district-seq)
      registrationNo: v.string(), // SSC/REG/YYYY/NNN charter reference
      jurisdiction: v.optional(v.string()), // mandals / neighborhoods covered
      lat: v.optional(v.number()), // HQ coordinates
      lng: v.optional(v.number()),
      address: v.optional(v.string()),
      contactPhone: v.optional(v.string()),
      status: v.string(), // pending | active | suspended | rejected
      reviewNote: v.optional(v.string()),
      registeredBy: v.id("users"),
      reviewedAt: v.optional(v.number()),
      createdAt: v.number(),
    })
      .index("by_status", ["status"])
      .index("by_state", ["state"]),

    // Gemini-driven demand forecasts & fair-pricing stabilization snapshots
    forecasts: defineTable({
      kind: v.string(), // "forecast" | "stabilization"
      district: v.string(),
      demandIndex: v.number(), // 1..100
      primaryDeficitTrades: v.array(v.string()),
      priceRecommendation: v.string(),
      welfarePoolAllocation: v.number(), // suggested % of welfare reserve
      advisories: v.array(v.string()), // tactical advisories for branch managers
      summary: v.optional(v.string()),
      source: v.string(), // "gemini" | "heuristic"
      model: v.optional(v.string()),
      context: v.optional(v.string()), // telemetry snapshot fed to the model
      topTrade: v.optional(v.string()), // forecasted high-demand trade
      topTradeReason: v.optional(v.string()),
      fairRatePerHour: v.optional(v.number()),
      confidence: v.optional(v.number()), // AI confidence 0-100
      createdBy: v.id("users"),
      createdAt: v.number(),
    })
      .index("by_created", ["createdAt"])
      .index("by_district", ["district"]),

    // In-booking chat between customer and worker
    messages: defineTable({
      bookingId: v.id("bookings"),
      senderId: v.id("users"),
      senderName: v.string(),
      senderRole: v.string(), // "customer" | "worker" | "admin"
      body: v.string(),
      at: v.number(),
    }).index("by_booking", ["bookingId"]),

    // Admin security — audit ledger of all clearance attempts & privileged actions
    adminAuditLog: defineTable({
      actorId: v.optional(v.id("users")), // null when unauthenticated
      email: v.optional(v.string()), // claimed email at attempt time
      kind: v.string(), // "clearance_attempt" | "clearance_granted" | "clearance_denied" | "kyc_review" | "admin_cancel" | "dispute_resolution"
      method: v.optional(v.string()), // "otp" | "passcode"
      ok: v.boolean(),
      detail: v.optional(v.string()),
      at: v.number(),
    })
      .index("by_at", ["at"])
      .index("by_kind", ["kind"]),

    // Rate limiting / lockout state. One row per (scope, subject) pair — the
    // key is namespaced by the operation being limited, e.g.
    // "otp:<hashed email>", "booking:<userId>", "msg:<userId>".
    //
    // This is deliberately per-subject rather than a single global counter: a
    // shared row means one attacker exhausting a limit locks every legitimate
    // user out at the same time, turning spam protection into a denial of
    // service against your own members.
    rateLimits: defineTable({
      key: v.string(), // "<scope>:<subject>", unique per rate-limited operation
      count: v.number(),
      windowStart: v.number(),
      updatedAt: v.number(),
    }).index("by_key", ["key"]),

    // Federation notifications — admin actions toward workers (add/remove etc.)
    notifications: defineTable({
      userId: v.id("users"), // recipient
      kind: v.string(), // "worker_added" | "worker_removed" | "custom"
      title: v.string(),
      body: v.string(),
      readAt: v.optional(v.number()),
      createdAt: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_user_read", ["userId", "readAt"]),

    // Work evidence — photos workers upload for skill verification by the board
    workSamples: defineTable({
      artisanId: v.id("artisans"),
      userId: v.id("users"), // owner (denormalized for auth checks)
      // Cleared once a verified sample's image is released. Work photos are
      // personal data — the board's decision is the record, the picture does
      // not need to outlive it.
      storageId: v.optional(v.id("_storage")),
      mimeType: v.string(),
      caption: v.optional(v.string()),
      status: v.string(), // "pending" | "approved" | "rejected"
      reviewNote: v.optional(v.string()),
      // The text that stands in for the released image, so the worker still
      // sees a verdict rather than an empty tile.
      verdictText: v.optional(v.string()),
      imagePurgedAt: v.optional(v.number()),
      reviewedBy: v.optional(v.id("users")),
      reviewedAt: v.optional(v.number()),
      uploadedAt: v.number(),
    })
      .index("by_artisan", ["artisanId"])
      .index("by_status", ["status"]),

    // Worker-created work listings — a worker can publish their own service,
    // either inside one of the six standard trades or inside a category they
    // define themselves. Board approval puts them on the customer catalog.
    customServices: defineTable({
      artisanId: v.id("artisans"), // creator
      userId: v.id("users"), // denormalized for auth checks
      name: v.string(), // the work itself, e.g. "Terrace waterproofing"
      description: v.string(),
      // One of the six trade ids — decides which workers see it on the radar.
      trade: v.string(),
      // Display category: either a standard trade id or the worker's own
      // category name when they created one.
      category: v.string(),
      isCustomCategory: v.boolean(), // true when the worker named their own category
      base: v.number(), // visit charge, INR
      hourly: v.number(), // per-hour labour, INR (0 = fixed price job)
      urgent: v.boolean(),
      district: v.string(), // creator's district (dispatch filtering)
      status: v.string(), // "pending" | "approved" | "rejected"
      reviewNote: v.optional(v.string()),
      reviewedBy: v.optional(v.id("users")),
      reviewedAt: v.optional(v.number()),
      createdAt: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_status", ["status"])
      .index("by_trade", ["trade"]),

    // Dispute arbitration — double-blind flags from customers and workers
    disputes: defineTable({
      bookingId: v.id("bookings"),
      raisedBy: v.id("users"),
      raisedByRole: v.string(), // "customer" | "worker"
      category: v.string(), // "late" | "quality" | "unsafe" | "payment" | "behavior" | "other"
      details: v.string(),
      status: v.string(), // open | resolved | dismissed | blacklisted
      resolution: v.optional(v.string()),
      resolvedBy: v.optional(v.id("users")),
      resolvedAt: v.optional(v.number()),
      createdAt: v.number(),
    })
      .index("by_status", ["status"])
      .index("by_booking", ["bookingId"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
