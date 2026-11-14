// The static part of the demo data (`pnpm db:seed`): the photos, the shops, their workshops and the people. No logic here. Photos are real photographs on the internet (Unsplash, stable links); each
// one was looked at and put with a workshop it fits. Prices are in the MINOR units of the currency of the shop (VND, KRW and JPY have no decimals; THB and USD have two).

/** A photograph on Unsplash, `w` pixels wide. Only https links to the internet are used: nothing is uploaded for the demo. */
export const photo = (id: string, w = 1200): string => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=70`;

/** What each photograph shows (so that a workshop gets a photo that fits it). */
export const P = {
  cookTogether: "1556910103-1c02745aae4d", streetFood: "1504674900247-0877df9cc836", sourdough: "1509440159596-0249088772ff", latte: "1495474472287-4d71bcdd2085",
  chocCake: "1578985545062-69928b1d9587", cookCouple: "1556909114-f6e7ad7d3136", ceramics: "1610701596007-11502861dcfa", buddhaBowl: "1512621776951-a57141f2eefd",
  ramen: "1569718212165-3a8278d5f624", donuts: "1551024601-bec78aea704b", cupcakes: "1486427944299-d1955d23e34d", cookies: "1558961363-fa8fdf82db35",
  pourOver: "1442512595331-e89e73853f31", teaCookie: "1544787219-7f47ccb76574", sushi: "1579871494447-9811cf80d66c", curry: "1565557623262-b51c2513a641",
  pizza: "1513104890138-7c749659a591", saladBar: "1498837167922-ddd27525d352", fineDining: "1414235077428-338989a2e8c0", vases: "1565193566173-7a0ee3dbe261",
  grill: "1555939594-58d7cb561ad1", veggies: "1590779033100-9f60a05a013d", spices: "1563822249548-9a72b6353cd1", tarts: "1464305795204-6f5bbfc7fb81",
  bakery: "1517433670267-08bbd4be890f", pastries: "1495147466023-ac5c588e2e94", ribs: "1544025162-d76694265947", pancakes: "1567620905732-2d1ec7ab7445",
  salad: "1540189549336-e6e99c3679fe", chopping: "1551218808-94e220e084d2", wagashi: "1627308595229-7830a5c91f9f", pepperoni: "1605478371310-a9f1e96b4ff4",
  studio: "1604328698692-f76ea9498e76", oreoCupcakes: "1612203985729-70726954388c", burger: "1481070555726-e2fe8357725c",
} as const;

export type Text = Record<string, string>;

export interface WorkshopSeed {
  key: string; title: Text; short: Text; description: Text; includes: Record<string, string[]>;
  durationMinutes: number; price: number; capacity: number; maxPerBooking: number; categories: string[]; status: "ACTIVE" | "DRAFT";
  /** The photo of the workshop and the ones of its gallery. */
  cover: string; gallery: string[];
  /** A weekly schedule; without it the sessions are made by hand (see `manual` of the shop). */
  rule?: { weekdays: number[]; times: string[] };
}

export interface ShopSeed {
  key: string; name: string; slug: string; status: "ACTIVE" | "DRAFT" | "SUSPENDED"; statusReason?: string;
  owner: { email: string; name: string };
  country: string; timezone: string; currency: string; defaultLocale: "en" | "vi" | "ko" | "ja" | "zh"; enabledLocales: string[];
  phone: string; whatsapp: string; address: string; mapsUrl: string;
  workshops: WorkshopSeed[];
  /** How much history: weeks of sessions in the past and days to come; 0 for none. */
  weeksBack: number; daysForward: number;
  /** A landing page: its template, its palette and whether it is published. `null`: the shop has no page. */
  page: { template: "classic" | "magazine" | "cinematic" | "bookingrail" | "journey" | "bento" | "sidebar" | "appstyle"; palette: string; font: string; live: boolean; versions: number; extraDraft?: boolean } | null;
  customDomain?: { domain: string; verified: boolean };
  /** Shown on the Workshops page of the customers (chosen by the platform administrator). */
  listed: boolean;
}

export const PASSWORD_NOTE = "Every demo account has the same password: see apps/api/.seed-credentials, or choose it with SEED_PASSWORD.";

// ---- the people --------------------------------------------------------------------------------------------------------------------------------------------

export interface Guest { name: string; email: string; country: string; phone: string }

/** The guests: every one of them also has an account (a customer), so the customer area shows their bookings in every shop. */
export const GUESTS: readonly Guest[] = [
  { name: "Emma Wilson", email: "emma@example.com", country: "GB", phone: "+44 7700 900101" },
  { name: "Minh Tran", email: "minh.tran@example.com", country: "VN", phone: "+84 90 100 2001" },
  { name: "Yuki Tanaka", email: "yuki.tanaka@example.com", country: "JP", phone: "+81 90 1234 5678" },
  { name: "Jisoo Kim", email: "jisoo.kim@example.com", country: "KR", phone: "+82 10 2345 6789" },
  { name: "Li Wei", email: "li.wei@example.com", country: "CN", phone: "+86 138 0013 8000" },
  { name: "Sophie Martin", email: "sophie.martin@example.com", country: "FR", phone: "+33 6 12 34 56 78" },
  { name: "Noah Brown", email: "noah.brown@example.com", country: "US", phone: "+1 415 555 0132" },
  { name: "Linh Pham", email: "linh.pham@example.com", country: "VN", phone: "+84 91 300 4002" },
  { name: "Anna Schmidt", email: "anna.schmidt@example.com", country: "DE", phone: "+49 151 2345 6789" },
  { name: "Carlos Diaz", email: "carlos.diaz@example.com", country: "ES", phone: "+34 612 345 678" },
  { name: "Hana Park", email: "hana.park@example.com", country: "KR", phone: "+82 10 3456 7890" },
  { name: "Tuan Nguyen", email: "tuan.nguyen@example.com", country: "VN", phone: "+84 93 400 5003" },
  { name: "Olivia Jones", email: "olivia.jones@example.com", country: "AU", phone: "+61 412 345 678" },
  { name: "Kenji Sato", email: "kenji.sato@example.com", country: "JP", phone: "+81 80 9876 5432" },
  { name: "Somchai Prasert", email: "somchai.prasert@example.com", country: "TH", phone: "+66 81 234 5678" },
  { name: "Mai Anh Vo", email: "maianh.vo@example.com", country: "VN", phone: "+84 98 600 7004" },
];

/** People at the studio who gave no email (walk-ins and phone bookings): they are customers of the shop but have no account. */
export const WALK_INS: readonly { name: string; country: string; phone: string }[] = [
  { name: "Walk-in couple", country: "VN", phone: "+84 90 000 0001" },
  { name: "Tourist from the hotel", country: "US", phone: "+1 202 555 0143" },
  { name: "Phone booking (regular)", country: "VN", phone: "+84 90 000 0003" },
];

/** Accounts that are not guests: their states are what is being tested. */
export const SPECIAL_USERS = {
  unverified: { email: "unverified.user@example.com", name: "Una Verified", status: "UNVERIFIED" as const },
  disabled: { email: "disabled.user@example.com", name: "Dan Disabled", status: "DISABLED" as const },
};

export const DEMO_ACCOUNTS = {
  admin: "admin@workshopkit.example",
  activeOwner: "linh@whiskladle.example",
  draftOwner: "ava@sugarsift.example",
  suspendedOwner: "minh@goldennoodle.example",
  customer: "emma@example.com",
  lotusOwner: "hoa@lotusceramics.example",
  seoulOwner: "jin@seoulkitchen.example",
  tokyoOwner: "sakura@tokyotea.example",
  bangkokOwner: "nok@bangkokbites.example",
  edgeOwner: "sam@edgecaselab.example",
  quietOwner: "an@quietcorner.example",
  unverified: SPECIAL_USERS.unverified.email,
  disabled: SPECIAL_USERS.disabled.email,
} as const;

// ---- the shops ---------------------------------------------------------------------------------------------------------------------------------------------

const vn = (en: string, vi: string): Text => ({ en, vi });

const WHISK: WorkshopSeed[] = [
  {
    key: "street-food", title: vn("Vietnamese Street Food Cooking Class", "Lớp nấu món đường phố Việt Nam"), short: vn("Cook three iconic street dishes with a local chef.", "Nấu ba món đường phố nổi tiếng cùng đầu bếp địa phương."),
    description: vn("Start at the market, then cook banh xeo, fresh spring rolls and a rich beef noodle soup in a small group.", "Bắt đầu từ chợ, rồi nấu bánh xèo, gỏi cuốn và một tô phở bò đậm đà trong nhóm nhỏ."),
    includes: { en: ["Market tour", "All ingredients", "Recipe booklet", "Lunch"], vi: ["Đi chợ cùng đầu bếp", "Toàn bộ nguyên liệu", "Sổ công thức", "Bữa trưa"] },
    durationMinutes: 180, price: 850_000, capacity: 10, maxPerBooking: 4, categories: ["COOKING"], status: "ACTIVE", cover: photo(P.streetFood), gallery: [photo(P.chopping), photo(P.cookTogether), photo(P.saladBar)],
    rule: { weekdays: [6, 0], times: ["09:00", "14:00"] },
  },
  {
    key: "pho", title: vn("Pho From Scratch", "Phở nấu từ đầu"), short: vn("Simmer a clear, fragrant broth and slice the perfect bowl.", "Ninh nước dùng trong và thơm, thái và bày một tô phở hoàn hảo."),
    description: vn("Learn the spices, the charring of aromatics and the patience behind a great pho.", "Học về gia vị, cách nướng hành gừng và sự kiên nhẫn làm nên tô phở ngon."),
    includes: { en: ["Ingredients", "Apron", "Take-home broth"], vi: ["Nguyên liệu", "Tạp dề", "Nước dùng mang về"] },
    durationMinutes: 150, price: 700_000, capacity: 8, maxPerBooking: 4, categories: ["COOKING"], status: "ACTIVE", cover: photo(P.ramen), gallery: [photo(P.spices), photo(P.veggies)],
    rule: { weekdays: [2, 4], times: ["18:30"] },
  },
  {
    key: "sourdough", title: vn("Sourdough Bread Basics", "Làm bánh mì sourdough cơ bản"), short: vn("Shape, proof and bake your own loaf.", "Tạo hình, ủ và nướng ổ bánh của riêng bạn."),
    description: vn("A hands-on introduction to wild yeast, folding and scoring. You take home a loaf and a starter.", "Buổi học thực hành về men tự nhiên, gấp bột và rạch bánh. Bạn mang về một ổ bánh và men mẹ."),
    includes: { en: ["Starter to take home", "One loaf", "Tea and snacks"], vi: ["Men mẹ mang về", "Một ổ bánh", "Trà và đồ ăn nhẹ"] },
    durationMinutes: 210, price: 950_000, capacity: 8, maxPerBooking: 3, categories: ["BAKING"], status: "ACTIVE", cover: photo(P.sourdough), gallery: [photo(P.bakery), photo(P.pastries)],
    rule: { weekdays: [5], times: ["10:00"] },
  },
  {
    key: "banh-mi", title: vn("Banh Mi at Home", "Bánh mì tại nhà"), short: vn("Bake crusty baguettes and build the classic sandwich.", "Nướng bánh mì giòn vỏ và làm ổ bánh mì kinh điển."),
    description: vn("From dough to pate and pickles: a relaxed class for families and groups, up to six guests a booking.", "Từ bột đến pate và đồ chua: lớp học thoải mái cho gia đình và nhóm, tối đa sáu khách mỗi lần đặt."),
    includes: { en: ["Ingredients", "Apron", "Two sandwiches to take home"], vi: ["Nguyên liệu", "Tạp dề", "Hai ổ bánh mì mang về"] },
    durationMinutes: 120, price: 600_000, capacity: 12, maxPerBooking: 6, categories: ["BAKING", "COOKING"], status: "ACTIVE", cover: photo(P.bakery), gallery: [photo(P.cookCouple), photo(P.pastries)],
    rule: { weekdays: [3], times: ["15:00"] },
  },
  {
    key: "chef-table", title: vn("Private Chef's Table", "Bàn tiệc riêng của đầu bếp"), short: vn("A six-guest dinner cooked with you, by arrangement.", "Bữa tối sáu khách cùng nấu với đầu bếp, theo lịch hẹn."),
    description: vn("No weekly schedule: the studio opens a date for you on request (sessions are made by hand).", "Không có lịch cố định: studio mở ngày riêng theo yêu cầu (buổi học được tạo thủ công)."),
    includes: { en: ["Five-course dinner", "Wine pairing"], vi: ["Bữa tối năm món", "Rượu vang kèm món"] },
    durationMinutes: 240, price: 2_400_000, capacity: 6, maxPerBooking: 6, categories: ["COOKING"], status: "ACTIVE", cover: photo(P.fineDining), gallery: [photo(P.cookTogether)],
  },
  {
    key: "coffee", title: vn("Coffee Cupping Lab", "Phòng thí nghiệm cà phê"), short: vn("Taste, compare and learn to describe coffee.", "Nếm, so sánh và học cách mô tả cà phê."),
    description: vn("A relaxed cupping of five Vietnamese single origins. Coming soon.", "Buổi cupping năm loại cà phê đơn nguồn Việt Nam. Sắp ra mắt."),
    includes: { en: ["Five coffees", "Tasting notes"], vi: ["Năm loại cà phê", "Phiếu nếm thử"] },
    durationMinutes: 90, price: 450_000, capacity: 12, maxPerBooking: 4, categories: ["COFFEE_TEA"], status: "DRAFT", cover: photo(P.pourOver), gallery: [photo(P.latte)],
  },
];

const SUGAR: WorkshopSeed[] = [
  {
    key: "macarons", title: vn("French Macarons Workshop", "Workshop macaron kiểu Pháp"), short: vn("Pipe, bake and fill your own macarons.", "Tự bóp, nướng và kẹp nhân macaron."),
    description: vn("Opening soon.", "Sắp khai trương."), includes: { en: ["Ingredients"], vi: ["Nguyên liệu"] },
    durationMinutes: 150, price: 800_000, capacity: 8, maxPerBooking: 4, categories: ["BAKING"], status: "DRAFT", cover: photo(P.cupcakes), gallery: [photo(P.cookies), photo(P.oreoCupcakes)],
  },
];

const NOODLE: WorkshopSeed[] = [
  {
    key: "noodles", title: vn("Hand-Pulled Noodles", "Mì kéo tay"), short: vn("Knead, rest and pull noodles by hand.", "Nhào, ủ và kéo mì bằng tay."),
    description: vn("A noodle class from a family kitchen.", "Lớp làm mì từ một căn bếp gia đình."), includes: { en: ["Ingredients", "Lunch"], vi: ["Nguyên liệu", "Bữa trưa"] },
    durationMinutes: 120, price: 600_000, capacity: 10, maxPerBooking: 4, categories: ["COOKING"], status: "ACTIVE", cover: photo(P.ramen), gallery: [photo(P.salad)],
    rule: { weekdays: [3], times: ["17:00"] },
  },
];

const LOTUS: WorkshopSeed[] = [
  {
    key: "wheel", title: vn("Wheel Throwing Basics", "Làm gốm trên bàn xoay cơ bản"), short: vn("Centre the clay and throw your first bowl.", "Vào tâm đất sét và làm chiếc bát đầu tiên."),
    description: vn("Two hours at the wheel with a potter of Thanh Ha village. Your piece is fired and ready for pick-up in two weeks.", "Hai giờ bên bàn xoay cùng nghệ nhân làng gốm Thanh Hà. Sản phẩm được nung và sẵn sàng nhận sau hai tuần."),
    includes: { en: ["Clay and tools", "Firing of one piece", "Tea"], vi: ["Đất sét và dụng cụ", "Nung một sản phẩm", "Trà"] },
    durationMinutes: 120, price: 1_200_000, capacity: 6, maxPerBooking: 3, categories: ["POTTERY", "CRAFTS"], status: "ACTIVE", cover: photo(P.ceramics), gallery: [photo(P.vases), photo(P.studio)],
    rule: { weekdays: [1, 3, 6], times: ["09:30", "14:00"] },
  },
  {
    key: "glaze", title: vn("Glaze and Paint a Mug", "Tráng men và vẽ cốc gốm"), short: vn("Paint a ready-made mug and take it home.", "Vẽ lên chiếc cốc có sẵn và mang về."),
    description: vn("A relaxed afternoon for all ages: choose your glazes, paint, and we fire it for you.", "Buổi chiều thư giãn cho mọi lứa tuổi: chọn men, vẽ, và chúng tôi nung giúp bạn."),
    includes: { en: ["Mug", "Glazes", "Firing"], vi: ["Cốc", "Men", "Nung"] },
    durationMinutes: 90, price: 650_000, capacity: 10, maxPerBooking: 4, categories: ["POTTERY", "ART"], status: "ACTIVE", cover: photo(P.vases), gallery: [photo(P.ceramics)],
    rule: { weekdays: [2, 4], times: ["16:00"] },
  },
  {
    key: "date", title: vn("Couples Pottery Date", "Buổi gốm cho cặp đôi"), short: vn("Two wheels, one evening.", "Hai bàn xoay, một buổi tối."),
    description: vn("A quiet evening for two with a glass of wine.", "Một buổi tối yên tĩnh cho hai người, kèm một ly vang."),
    includes: { en: ["Clay and tools", "Wine", "Firing of two pieces"], vi: ["Đất sét và dụng cụ", "Rượu vang", "Nung hai sản phẩm"] },
    durationMinutes: 150, price: 1_800_000, capacity: 4, maxPerBooking: 2, categories: ["POTTERY"], status: "ACTIVE", cover: photo(P.studio), gallery: [photo(P.ceramics)],
    rule: { weekdays: [5], times: ["17:00"] },
  },
];

const SEOUL: WorkshopSeed[] = [
  {
    key: "kimchi", title: { ko: "김치와 반찬 만들기", en: "Kimchi & Banchan Class" }, short: { ko: "배추김치와 제철 반찬을 직접 담가 보세요.", en: "Make napa cabbage kimchi and seasonal side dishes." },
    description: { ko: "시장에서 재료를 고르고, 김치 양념을 만들어 배추를 버무립니다. 만든 김치는 병에 담아 가져갑니다.", en: "Choose ingredients at the market, make the paste and rub it into the cabbage. You take your jar home." },
    includes: { ko: ["재료 일체", "김치 한 병", "점심"], en: ["All ingredients", "A jar of kimchi", "Lunch"] },
    durationMinutes: 150, price: 65_000, capacity: 8, maxPerBooking: 4, categories: ["COOKING"], status: "ACTIVE", cover: photo(P.veggies), gallery: [photo(P.spices), photo(P.cookTogether)],
    rule: { weekdays: [3, 6], times: ["11:00"] },
  },
  {
    key: "bbq", title: { ko: "집에서 즐기는 한국식 바비큐", en: "Korean BBQ at Home" }, short: { ko: "양념 갈비와 쌈 채소로 한 상 차려요.", en: "Marinate, grill and wrap like a local." },
    description: { ko: "양념 만들기부터 굽는 법, 쌈 싸 먹는 법까지 배웁니다.", en: "From the marinade to the grill and the perfect wrap." },
    includes: { ko: ["재료", "저녁 식사"], en: ["Ingredients", "Dinner"] },
    durationMinutes: 120, price: 85_000, capacity: 10, maxPerBooking: 5, categories: ["COOKING"], status: "ACTIVE", cover: photo(P.grill), gallery: [photo(P.ribs)],
    rule: { weekdays: [5], times: ["18:30"] },
  },
  {
    key: "hotteok", title: { ko: "호떡과 길거리 간식", en: "Hotteok & Street Snacks" }, short: { ko: "달콤한 호떡을 반죽부터 구워 봅니다.", en: "Fill, flatten and pan-fry sweet hotteok." },
    description: { ko: "겨울 길거리 간식의 대표 호떡을 만들어 봅니다.", en: "The classic winter street snack, from dough to pan." },
    includes: { ko: ["재료", "따뜻한 차"], en: ["Ingredients", "Hot tea"] },
    durationMinutes: 90, price: 45_000, capacity: 12, maxPerBooking: 6, categories: ["COOKING", "BAKING"], status: "ACTIVE", cover: photo(P.pancakes), gallery: [photo(P.teaCookie)],
    rule: { weekdays: [0], times: ["14:00"] },
  },
];

const TOKYO: WorkshopSeed[] = [
  {
    key: "sushi", title: { ja: "寿司の巻き方ワークショップ", en: "Sushi Rolling Workshop" }, short: { ja: "酢飯の作り方から巻き寿司まで。", en: "From seasoned rice to your own maki rolls." },
    description: { ja: "寿司職人から酢飯の合わせ方、具材の切り方、巻き方を学びます。", en: "A sushi chef shows you how to season the rice, cut the fillings and roll." },
    includes: { ja: ["材料一式", "お吸い物", "お持ち帰り用の寿司"], en: ["All ingredients", "Miso soup", "Rolls to take away"] },
    durationMinutes: 120, price: 9_800, capacity: 8, maxPerBooking: 4, categories: ["COOKING"], status: "ACTIVE", cover: photo(P.sushi), gallery: [photo(P.chopping), photo(P.saladBar)],
    rule: { weekdays: [4, 6], times: ["11:00"] },
  },
  {
    key: "wagashi", title: { ja: "和菓子づくり体験", en: "Wagashi Sweet Making" }, short: { ja: "季節の練り切りを作ります。", en: "Shape seasonal nerikiri sweets." },
    description: { ja: "餡と練り切りで、季節の花を形づくります。お抹茶付き。", en: "Shape flowers from bean paste, served with matcha." },
    includes: { ja: ["材料", "お抹茶", "桐箱"], en: ["Ingredients", "Matcha", "A gift box"] },
    durationMinutes: 90, price: 7_500, capacity: 8, maxPerBooking: 4, categories: ["BAKING", "CRAFTS"], status: "ACTIVE", cover: photo(P.wagashi), gallery: [photo(P.teaCookie)],
    rule: { weekdays: [2], times: ["14:00"] },
  },
  {
    key: "matcha", title: { ja: "抹茶とお茶の試飲会", en: "Matcha & Tea Tasting" }, short: { ja: "産地の違う日本茶を飲み比べ。", en: "Compare Japanese teas from different regions." },
    description: { ja: "茶師と一緒に五種類のお茶を味わいます。", en: "Five teas with a tea master." },
    includes: { ja: ["お茶五種", "和菓子"], en: ["Five teas", "Sweets"] },
    durationMinutes: 60, price: 5_500, capacity: 10, maxPerBooking: 5, categories: ["COFFEE_TEA"], status: "ACTIVE", cover: photo(P.teaCookie), gallery: [photo(P.wagashi)],
    rule: { weekdays: [1, 3, 5], times: ["15:00"] },
  },
];

const BANGKOK: WorkshopSeed[] = [
  {
    key: "curry", title: { en: "Thai Curry From Scratch" }, short: { en: "Pound your own paste and cook green and red curry." },
    description: { en: "Pound the paste in a mortar, then cook two curries with coconut milk and fresh herbs." },
    includes: { en: ["Ingredients", "Recipe card", "Lunch"] },
    durationMinutes: 150, price: 180_000, capacity: 10, maxPerBooking: 5, categories: ["COOKING"], status: "ACTIVE", cover: photo(P.curry), gallery: [photo(P.spices), photo(P.veggies)],
    rule: { weekdays: [2, 6], times: ["10:00"] },
  },
  {
    key: "som-tam", title: { en: "Street Salad & Som Tam" }, short: { en: "Balance sweet, sour, salty and hot." },
    description: { en: "Make the famous papaya salad and two street-side salads." },
    includes: { en: ["Ingredients", "Drinks"] },
    durationMinutes: 90, price: 120_000, capacity: 12, maxPerBooking: 6, categories: ["COOKING"], status: "ACTIVE", cover: photo(P.saladBar), gallery: [photo(P.salad)],
    rule: { weekdays: [4], times: ["17:30"] },
  },
];

const EDGE: WorkshopSeed[] = [
  {
    key: "pizza-night", title: { en: "Sold-Out Pizza Night" }, short: { en: "Four seats only: one session is sold out on purpose." },
    description: { en: "A tiny class for testing sold-out and last-seat behaviour." }, includes: { en: ["Dough", "Toppings", "Dinner"] },
    durationMinutes: 120, price: 4_500, capacity: 4, maxPerBooking: 4, categories: ["COOKING"], status: "ACTIVE", cover: photo(P.pizza), gallery: [photo(P.pepperoni)],
  },
  {
    key: "burger-lab", title: { en: "Burger Lab" }, short: { en: "Sessions in every state: running, paused, closed, moved." },
    description: { en: "Used to test every state of a session and what happens to its bookings." }, includes: { en: ["Buns", "Patties", "Sides"] },
    durationMinutes: 90, price: 3_000, capacity: 10, maxPerBooking: 5, categories: ["COOKING"], status: "ACTIVE", cover: photo(P.burger), gallery: [photo(P.pizza)],
  },
  {
    key: "free-intro", title: { en: "Free Intro Class" }, short: { en: "Price 0: a booking has nothing to pay." },
    description: { en: "Tests a free workshop: the booking total is zero and the payment screens say so." }, includes: { en: ["Coffee"] },
    durationMinutes: 45, price: 0, capacity: 20, maxPerBooking: 10, categories: ["OTHER"], status: "ACTIVE", cover: photo(P.latte), gallery: [photo(P.pourOver)],
  },
  {
    key: "intensive", title: { en: "Weekend Intensive" }, short: { en: "A long class with a high price and a small group." },
    description: { en: "A full-day class (600 minutes: the longest a workshop can be)." }, includes: { en: ["Lunch", "Materials"] },
    durationMinutes: 600, price: 12_000, capacity: 6, maxPerBooking: 2, categories: ["COOKING", "BAKING"], status: "ACTIVE", cover: photo(P.cookCouple), gallery: [photo(P.cookTogether), photo(P.bakery)],
  },
  {
    key: "draft-class", title: { en: "Draft Workshop (not public yet)" }, short: { en: "A draft: it is not shown to guests." },
    description: { en: "Tests the draft state of a workshop." }, includes: { en: ["Nothing yet"] },
    durationMinutes: 60, price: 2_000, capacity: 8, maxPerBooking: 4, categories: ["OTHER"], status: "DRAFT", cover: photo(P.donuts), gallery: [],
  },
];

const QUIET: WorkshopSeed[] = [
  {
    key: "tea-hour", title: vn("Afternoon Tea Hour", "Giờ trà chiều"), short: vn("An ACTIVE shop whose landing page was never published.", "Một shop đã hoạt động nhưng chưa công bố landing page."),
    description: vn("The shop is ACTIVE but has no published page: its public address answers 404 until the owner publishes one.", "Shop đã ACTIVE nhưng chưa có trang công bố: địa chỉ công khai trả về 404 cho tới khi chủ shop công bố."),
    includes: { en: ["Tea", "Cakes"], vi: ["Trà", "Bánh"] },
    durationMinutes: 60, price: 300_000, capacity: 8, maxPerBooking: 4, categories: ["COFFEE_TEA"], status: "ACTIVE", cover: photo(P.teaCookie), gallery: [photo(P.chocCake)],
    rule: { weekdays: [6], times: ["15:00"] },
  },
];

const HCMC = { country: "VN", timezone: "Asia/Ho_Chi_Minh", currency: "VND" } as const;

export const SHOPS: ShopSeed[] = [
  {
    key: "whisk", name: "Whisk & Ladle Kitchen", slug: "whiskladle", status: "ACTIVE", owner: { email: DEMO_ACCOUNTS.activeOwner, name: "Linh Tran" }, ...HCMC, defaultLocale: "en", enabledLocales: ["en", "vi"],
    phone: "+84 28 3822 0000", whatsapp: "+84 90 123 4567", address: "12 Nguyen Hue, District 1, Ho Chi Minh City", mapsUrl: "https://www.google.com/maps/place/Nguyen+Hue+Walking+Street",
    workshops: WHISK, weeksBack: 6, daysForward: 60, page: { template: "classic", palette: "warm", font: "Inter", live: true, versions: 3, extraDraft: true }, listed: true,
  },
  {
    key: "sugar", name: "Sugar & Sift Bakery", slug: "sugarsift", status: "DRAFT", owner: { email: DEMO_ACCOUNTS.draftOwner, name: "Ava Nguyen" }, ...HCMC, defaultLocale: "en", enabledLocales: ["en", "vi"],
    phone: "+84 28 3822 1111", whatsapp: "", address: "8 Le Loi, District 1, Ho Chi Minh City", mapsUrl: "https://www.google.com/maps/place/Le+Loi+Street",
    workshops: SUGAR, weeksBack: 0, daysForward: 0, page: null, listed: false,
  },
  {
    key: "golden", name: "Golden Noodle House", slug: "goldennoodle", status: "SUSPENDED", statusReason: "Reported for misleading prices (demo)", owner: { email: DEMO_ACCOUNTS.suspendedOwner, name: "Minh Le" }, ...HCMC,
    defaultLocale: "en", enabledLocales: ["en", "vi"], phone: "+84 28 3822 2222", whatsapp: "", address: "25 Hai Ba Trung, District 3, Ho Chi Minh City", mapsUrl: "https://www.google.com/maps/place/Hai+Ba+Trung+Street",
    workshops: NOODLE, weeksBack: 4, daysForward: 20, page: { template: "bookingrail", palette: "sunset", font: "Noto Sans", live: true, versions: 1 }, listed: false,
  },
  {
    key: "lotus", name: "Lotus Ceramics Studio", slug: "lotusceramics", status: "ACTIVE", owner: { email: DEMO_ACCOUNTS.lotusOwner, name: "Hoa Nguyen" }, country: "VN", timezone: "Asia/Ho_Chi_Minh", currency: "VND",
    defaultLocale: "en", enabledLocales: ["en", "vi"], phone: "+84 235 3912 345", whatsapp: "+84 90 555 1212", address: "15 Tran Phu, Hoi An, Quang Nam", mapsUrl: "https://www.google.com/maps/place/Hoi+An+Ancient+Town",
    workshops: LOTUS, weeksBack: 5, daysForward: 45, page: { template: "magazine", palette: "mono", font: "Lora", live: true, versions: 2 }, customDomain: { domain: "workshops.lotusceramics.example", verified: false }, listed: true,
  },
  {
    key: "seoul", name: "Seoul Kitchen Class", slug: "seoulkitchen", status: "ACTIVE", owner: { email: DEMO_ACCOUNTS.seoulOwner, name: "Jin Park" }, country: "KR", timezone: "Asia/Seoul", currency: "KRW",
    defaultLocale: "ko", enabledLocales: ["ko", "en"], phone: "+82 2 3789 0000", whatsapp: "", address: "서울특별시 중구 명동길 14", mapsUrl: "https://www.google.com/maps/place/Myeongdong",
    workshops: SEOUL, weeksBack: 4, daysForward: 40, page: { template: "journey", palette: "forest", font: "Noto Sans", live: true, versions: 1 }, listed: true,
  },
  {
    key: "tokyo", name: "Tokyo Tea & Sweets", slug: "tokyotea", status: "ACTIVE", owner: { email: DEMO_ACCOUNTS.tokyoOwner, name: "Sakura Ito" }, country: "JP", timezone: "Asia/Tokyo", currency: "JPY",
    defaultLocale: "ja", enabledLocales: ["ja", "en"], phone: "+81 3 5555 0100", whatsapp: "", address: "東京都台東区浅草1-1-1", mapsUrl: "https://www.google.com/maps/place/Asakusa",
    workshops: TOKYO, weeksBack: 4, daysForward: 40, page: { template: "cinematic", palette: "noir", font: "Poppins", live: true, versions: 2 }, customDomain: { domain: "tea.tokyotea.example", verified: true }, listed: true,
  },
  {
    key: "bangkok", name: "Bangkok Bites Cooking School", slug: "bangkokbites", status: "ACTIVE", owner: { email: DEMO_ACCOUNTS.bangkokOwner, name: "Nok Suwan" }, country: "TH", timezone: "Asia/Bangkok", currency: "THB",
    defaultLocale: "en", enabledLocales: ["en"], phone: "+66 2 555 0123", whatsapp: "+66 81 555 0123", address: "88 Sukhumvit Soi 31, Bangkok", mapsUrl: "https://www.google.com/maps/place/Sukhumvit+Soi+31",
    workshops: BANGKOK, weeksBack: 4, daysForward: 40, page: { template: "appstyle", palette: "sunset", font: "Inter", live: true, versions: 1 }, listed: true,
  },
  {
    key: "edge", name: "Edge Case Lab", slug: "edgecases", status: "ACTIVE", owner: { email: DEMO_ACCOUNTS.edgeOwner, name: "Sam Carter" }, country: "US", timezone: "America/New_York", currency: "USD",
    defaultLocale: "en", enabledLocales: ["en", "vi", "ko", "ja", "zh"], phone: "+1 212 555 0100", whatsapp: "", address: "350 5th Ave, New York, NY", mapsUrl: "https://www.google.com/maps/place/Empire+State+Building",
    workshops: EDGE, weeksBack: 2, daysForward: 30, page: { template: "bento", palette: "indigo", font: "Inter", live: true, versions: 1 }, listed: true,
  },
  {
    key: "quiet", name: "Quiet Corner Studio", slug: "quietcorner", status: "ACTIVE", owner: { email: DEMO_ACCOUNTS.quietOwner, name: "An Le" }, country: "VN", timezone: "Asia/Ho_Chi_Minh", currency: "VND",
    defaultLocale: "en", enabledLocales: ["en", "vi"], phone: "+84 236 3555 000", whatsapp: "", address: "40 Bach Dang, Da Nang", mapsUrl: "https://www.google.com/maps/place/Han+River+Bridge",
    workshops: QUIET, weeksBack: 0, daysForward: 30, page: null, listed: false,
  },
];
