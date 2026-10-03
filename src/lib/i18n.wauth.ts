/* Worker-portal sign-in copy for Hindi, Telugu, Tamil and Bengali.
 *
 * Side module (see ./i18n.profile.ts for the reasoning): the regional
 * dictionaries resist large non-ASCII insertions, so these are merged via
 * initBnGateway() in i18n.tsx. The English keys live in i18n.tsx.
 */

export const WAUTH_HI: Record<string, string> = {
  wauth_badge: "वर्कर पोर्टल",
  wauth_title: "काम के लिए साइन-इन करें",
  wauth_sub: "अपना मोबाइल नंबर डालें, हम आपको एक बार का कोड एसएमएस भेजेंगे।",
  wauth_tab_phone: "मोबाइल",
  wauth_tab_email: "ईमेल",
  wauth_phone_ph: "98765 43210",
  wauth_phone_err: "सही 10 अंकों का मोबाइल नंबर डालें।",
  wauth_send_sms: "कोड भेजें",
  wauth_sending_sms: "भेजा जा रहा है…",
  wauth_sms_sent: "हमने {phone} पर कोड भेजा है",
  wauth_sms_desc: "{phone} पर भेजा गया 6 अंकों का कोड डालें।",
  wauth_wrong_code: "यह कोड सही नहीं है। कृपया दोबारा कोशिश करें।",
  wauth_switch_to_phone: "मेरा मोबाइल नंबर इस्तेमाल करें",
  wauth_use_diff: "दूसरा नंबर उपयोग करें",
  wauth_footnote:
    "नए हैं? साइन-इन के बाद ट्रेड प्रमाणन और संघ सदस्यता पूरी करें।",
  wauth_customer_link: "कारीगर बुक करना है?",
  wauth_customer_cta: "ग्राहक साइन-इन →",
  wauth_benefit_payout: "हर काम का 90% भुगतान सीधे आपके UPI पर",
  wauth_benefit_credential: "आपके ज़िले का भरोसेमंद डिजिटल ट्रेड प्रमाणपत्र",
  wauth_benefit_welfare: "हर निपटान काम पर कल्याण और लाभांश क्रेडिट",
  wauth_email_sub: "अपना ईमेल डालें और हम आपको एक बार का कोड भेजेंगे।",
};

export const WAUTH_TE: Record<string, string> = {
  wauth_badge: "వర్కర్ పోర్టల్",
  wauth_title: "పనికి సైన్-ఇన్ అవ్వండి",
  wauth_sub: "మీ మొబైల్ నంబర్ ఇవ్వండి, మేము ఒకసారి కోడ్ SMS పంపుతాము.",
  wauth_tab_phone: "మొబైల్",
  wauth_tab_email: "ఇమెయిల్",
  wauth_phone_ph: "98765 43210",
  wauth_phone_err: "సరైన 10 అంకెల మొబైల్ నంబర్ ఇవ్వండి.",
  wauth_send_sms: "కోడ్ పంపండి",
  wauth_sending_sms: "పంపుతోంది…",
  wauth_sms_sent: "మేము {phone} కు కోడ్ పంపాము",
  wauth_sms_desc: "{phone} కు పంపిన 6 అంకెల కోడ్ నమోదు చేయండి.",
  wauth_wrong_code: "ఆ కోడ్ సరైనది కాదు. దయచేసి మళ్లీ ప్రయత్నించండి.",
  wauth_switch_to_phone: "నా మొబైల్ నంబర్ వాడండి",
  wauth_use_diff: "వేరే నంబర్ వాడండి",
  wauth_footnote:
    "కొత్తవారా? సైన్-ఇన్ తర్వాత ట్రేడ్ ధృవీకరణ, సంఘ సభ్యత్వం పూర్తి చేయండి.",
  wauth_customer_link: "కార్మికుడిని బుక్ చేయాలనుకుంటున్నారా?",
  wauth_customer_cta: "కస్టమర్ సైన్-ఇన్ →",
  wauth_benefit_payout: "ప్రతి పనికి 90% మీ UPI కి నేరుగా",
  wauth_benefit_credential: "మీ జిల్లా నమ్మే డిజిటల్ ట్రేడ్ సర్టిఫికెట్",
  wauth_benefit_welfare: "ప్రతి సెటిల్ చేసిన పనికి సంఘ లాభాలు",
  wauth_email_sub: "మీ ఇమెయిల్ ఇవ్వండి, మేము ఒకసారి కోడ్ పంపుతాము.",
};

export const WAUTH_TA: Record<string, string> = {
  wauth_badge: "தொழிலாளி போர்டல்",
  wauth_title: "பணிக்கு உள்நுழைக",
  wauth_sub: "உங்கள் மொபைல் எண்ணை உள்ளிடுங்கள், ஒரு குறியீட்டை நாங்கள் அனுப்புவோம்.",
  wauth_tab_phone: "மொபைல்",
  wauth_tab_email: "மின்னஞ்சல்",
  wauth_phone_ph: "98765 43210",
  wauth_phone_err: "சரியான 10 இலக்க மொபைல் எண்ணை உள்ளிடுங்கள்.",
  wauth_send_sms: "குறியீட்டை அனுப்பு",
  wauth_sending_sms: "அனுப்பப்படுகிறது…",
  wauth_sms_sent: "நாங்கள் {phone} எண்ணுக்கு குறியீட்டு அனுப்பினோம்",
  wauth_sms_desc: "{phone} எண்ணுக்கு அனுப்பிய 6 இலக்க குறியீட்டை உள்ளிடுங்கள்.",
  wauth_wrong_code: "அந்த குறியீட்டு சரியல்ல. மீண்டும் முயற்சிக்கவும்.",
  wauth_switch_to_phone: "என் மொபைல் எண்ணைப் பயன்படுத்து",
  wauth_use_diff: "வேறு எண்ணைப் பயன்படுத்து",
  wauth_footnote:
    "புதியவரா? உள்நுழைந்த பிறகு வர்த்தகத் தேர்வு சான்றிதழ் மற்றும் சங்க உறுப்பினர் சான்றிதழை முடிக்கவும்.",
  wauth_customer_link: "தொழிலாளியை பதிவு செய்ய வேண்டுமா?",
  wauth_customer_cta: "வாடிக்கையாளர் உள்நுழைவு →",
  wauth_benefit_payout: "ஒவ்வொரு வேலைக்கும் 90% நேரடியாக உங்கள் UPI க்கு",
  wauth_benefit_credential: "உங்கள் மாவட்டம் நம்பும் டிஜிட்டல் வர்த்தகத் சான்றிதழ்",
  wauth_benefit_welfare: "ஒவ்வொரு நிறைவுற்ற வேலைக்கும் நலத்திட்டம் மற்றும் லாபக் கட்டணம்",
  wauth_email_sub: "உங்கள் மின்னஞ்சலை உள்ளிடுங்கள், ஒரு குறியீட்டை நாங்கள் அனுப்புவோம்.",
};

export const WAUTH_BN: Record<string, string> = {
  wauth_badge: "ওয়ার্কার পোর্টাল",
  wauth_title: "কাজ করতে সাইন ইন করুন",
  wauth_sub: "আপনার মোবাইল নম্বর দিন, আমরা একবারের কোড এসএমএসে পাঠাব।",
  wauth_tab_phone: "মোবাইল",
  wauth_tab_email: "ইমেইল",
  wauth_phone_ph: "98765 43210",
  wauth_phone_err: "সঠিক ১০ সংখ্যার মোবাইল নম্বর দিন।",
  wauth_send_sms: "কোড পাঠান",
  wauth_sending_sms: "পাঠানো হচ্ছে…",
  wauth_sms_sent: "আমরা {phone} নম্বরে কোড পাঠিয়েছি",
  wauth_sms_desc: "{phone} নম্বরে পাঠানো ৬ সংখ্যার কোডটি দিন।",
  wauth_wrong_code: "কোডটি সঠিক নয়। আবার চেষ্টা করুন।",
  wauth_switch_to_phone: "আমার মোবাইল নম্বর ব্যবহার করুন",
  wauth_use_diff: "অন্য নম্বর ব্যবহার করুন",
  wauth_footnote:
    "নতুন? সাইন ইন করার পর ট্রেড সার্টিফিকেশন ও সংঘ সদস্যতা সম্পন্ন করুন।",
  wauth_customer_link: "একজন কর্মী বুক করতে চান?",
  wauth_customer_cta: "কাস্টমার সাইন ইন →",
  wauth_benefit_payout: "প্রতিটি কাজের ৯০% সরাসরি আপনার UPI-তে",
  wauth_benefit_credential: "আপনার জেলার বিশ্বস্ত ডিজিটাল ট্রেড সার্টিফিকেট",
  wauth_benefit_welfare: "প্রতিটি সম্পন্ন কাজে কল্যাণ ও লভাংশ ক্রেডিট",
  wauth_email_sub: "আপনার ইমেইল দিন, আমরা একবারের কোড পাঠাব।",
};
