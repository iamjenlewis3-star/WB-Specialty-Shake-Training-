/** Static demo content definitions used by the seeder. All data is fictional. */

export const REGIONS = [
  { code: "NE", name: "Northeast" },
  { code: "MA", name: "Mid-Atlantic" },
  { code: "SE", name: "Southeast" },
  { code: "MW", name: "Midwest" },
  { code: "WE", name: "West" },
];

export const FRANCHISE_GROUPS = [
  { code: "CORP", name: "Wahlburgers Corporate", ownership: "Corporate", principal: "Wahlburgers Restaurant Group" },
  { code: "HRB", name: "Harborline Restaurant Group", ownership: "Franchise", principal: "Victor Salazar" },
  { code: "GLD", name: "Gold Standard Hospitality", ownership: "Franchise", principal: "Nadine Alcott" },
  { code: "SUN", name: "Sunbelt Dining Partners", ownership: "Franchise", principal: "Curtis Bellamy" },
  { code: "LKS", name: "Lakeshore Concepts", ownership: "Franchise", principal: "Ivy Mercado" },
  { code: "PCF", name: "Pacific Crest Foods", ownership: "Franchise", principal: "Hollis Tran" },
  { code: "SUM", name: "Summit Venture Dining", ownership: "Joint Venture", principal: "Garrett Poole" },
];

export const DEPARTMENTS = [
  { code: "BOH", name: "Back of House" },
  { code: "FOH", name: "Front of House" },
  { code: "BAR", name: "Bar" },
  { code: "MGMT", name: "Management" },
  { code: "CORP", name: "Corporate" },
  { code: "TRN", name: "Training" },
];

export const LOCATIONS: Array<{
  store: string; name: string; city: string; state: string; region: string; group: string; ownership: string;
}> = [
  { store: "1001", name: "Boston Seaport", city: "Boston", state: "MA", region: "NE", group: "CORP", ownership: "Corporate" },
  { store: "1002", name: "Hingham Shipyard", city: "Hingham", state: "MA", region: "NE", group: "CORP", ownership: "Corporate" },
  { store: "1003", name: "Boston Fenway", city: "Boston", state: "MA", region: "NE", group: "HRB", ownership: "Franchise" },
  { store: "1004", name: "Cambridge Kendall", city: "Cambridge", state: "MA", region: "NE", group: "HRB", ownership: "Franchise" },
  { store: "1005", name: "Providence Waterfront", city: "Providence", state: "RI", region: "NE", group: "HRB", ownership: "Franchise" },
  { store: "1006", name: "Portland Old Port", city: "Portland", state: "ME", region: "NE", group: "HRB", ownership: "Franchise" },
  { store: "1007", name: "Manchester Elm Street", city: "Manchester", state: "NH", region: "NE", group: "HRB", ownership: "Franchise" },
  { store: "1008", name: "Hartford Riverfront", city: "Hartford", state: "CT", region: "NE", group: "SUM", ownership: "Joint Venture" },
  { store: "1009", name: "New Haven Chapel", city: "New Haven", state: "CT", region: "NE", group: "SUM", ownership: "Joint Venture" },
  { store: "1010", name: "Worcester Canal District", city: "Worcester", state: "MA", region: "NE", group: "HRB", ownership: "Franchise" },
  { store: "2001", name: "Manhattan Midtown", city: "New York", state: "NY", region: "MA", group: "GLD", ownership: "Franchise" },
  { store: "2002", name: "Brooklyn Barclays", city: "Brooklyn", state: "NY", region: "MA", group: "GLD", ownership: "Franchise" },
  { store: "2003", name: "Jersey City Newport", city: "Jersey City", state: "NJ", region: "MA", group: "GLD", ownership: "Franchise" },
  { store: "2004", name: "Philadelphia Rittenhouse", city: "Philadelphia", state: "PA", region: "MA", group: "GLD", ownership: "Franchise" },
  { store: "2005", name: "Pittsburgh Strip District", city: "Pittsburgh", state: "PA", region: "MA", group: "GLD", ownership: "Franchise" },
  { store: "2006", name: "Baltimore Inner Harbor", city: "Baltimore", state: "MD", region: "MA", group: "SUM", ownership: "Joint Venture" },
  { store: "2007", name: "Washington Navy Yard", city: "Washington", state: "DC", region: "MA", group: "CORP", ownership: "Corporate" },
  { store: "2008", name: "Arlington Pentagon City", city: "Arlington", state: "VA", region: "MA", group: "SUM", ownership: "Joint Venture" },
  { store: "3001", name: "Charlotte Uptown", city: "Charlotte", state: "NC", region: "SE", group: "SUN", ownership: "Franchise" },
  { store: "3002", name: "Raleigh Glenwood", city: "Raleigh", state: "NC", region: "SE", group: "SUN", ownership: "Franchise" },
  { store: "3003", name: "Atlanta Midtown", city: "Atlanta", state: "GA", region: "SE", group: "SUN", ownership: "Franchise" },
  { store: "3004", name: "Savannah River Street", city: "Savannah", state: "GA", region: "SE", group: "SUN", ownership: "Franchise" },
  { store: "3005", name: "Orlando I-Drive", city: "Orlando", state: "FL", region: "SE", group: "SUN", ownership: "Franchise" },
  { store: "3006", name: "Tampa Riverwalk", city: "Tampa", state: "FL", region: "SE", group: "SUN", ownership: "Franchise" },
  { store: "3007", name: "Miami Brickell", city: "Miami", state: "FL", region: "SE", group: "SUN", ownership: "Franchise" },
  { store: "3008", name: "Nashville Broadway", city: "Nashville", state: "TN", region: "SE", group: "SUM", ownership: "Joint Venture" },
  { store: "3009", name: "Memphis Beale Street", city: "Memphis", state: "TN", region: "SE", group: "SUM", ownership: "Joint Venture" },
  { store: "3010", name: "Birmingham Uptown", city: "Birmingham", state: "AL", region: "SE", group: "SUN", ownership: "Franchise" },
  { store: "4001", name: "Chicago River North", city: "Chicago", state: "IL", region: "MW", group: "LKS", ownership: "Franchise" },
  { store: "4002", name: "Chicago Wrigleyville", city: "Chicago", state: "IL", region: "MW", group: "LKS", ownership: "Franchise" },
  { store: "4003", name: "Milwaukee Third Ward", city: "Milwaukee", state: "WI", region: "MW", group: "LKS", ownership: "Franchise" },
  { store: "4004", name: "Detroit Midtown", city: "Detroit", state: "MI", region: "MW", group: "LKS", ownership: "Franchise" },
  { store: "4005", name: "Grand Rapids Downtown", city: "Grand Rapids", state: "MI", region: "MW", group: "LKS", ownership: "Franchise" },
  { store: "4006", name: "Columbus Short North", city: "Columbus", state: "OH", region: "MW", group: "LKS", ownership: "Franchise" },
  { store: "4007", name: "Cleveland East 4th", city: "Cleveland", state: "OH", region: "MW", group: "LKS", ownership: "Franchise" },
  { store: "4008", name: "Minneapolis North Loop", city: "Minneapolis", state: "MN", region: "MW", group: "LKS", ownership: "Franchise" },
  { store: "4009", name: "Kansas City Power & Light", city: "Kansas City", state: "MO", region: "MW", group: "SUM", ownership: "Joint Venture" },
  { store: "5001", name: "Denver LoDo", city: "Denver", state: "CO", region: "WE", group: "PCF", ownership: "Franchise" },
  { store: "5002", name: "Phoenix Scottsdale", city: "Scottsdale", state: "AZ", region: "WE", group: "PCF", ownership: "Franchise" },
  { store: "5003", name: "Las Vegas Strip", city: "Las Vegas", state: "NV", region: "WE", group: "PCF", ownership: "Franchise" },
  { store: "5004", name: "Los Angeles Grove", city: "Los Angeles", state: "CA", region: "WE", group: "PCF", ownership: "Franchise" },
  { store: "5005", name: "San Diego Gaslamp", city: "San Diego", state: "CA", region: "WE", group: "PCF", ownership: "Franchise" },
  { store: "5006", name: "San Francisco Embarcadero", city: "San Francisco", state: "CA", region: "WE", group: "PCF", ownership: "Franchise" },
  { store: "5007", name: "Seattle Pike Place", city: "Seattle", state: "WA", region: "WE", group: "PCF", ownership: "Franchise" },
  { store: "5008", name: "Portland Pearl District", city: "Portland", state: "OR", region: "WE", group: "PCF", ownership: "Franchise" },
];

export const COURSE_CATEGORIES = [
  { slug: "new-hire", name: "New Hire Orientation", color: "#1e5fbf" },
  { slug: "foh", name: "Front of House", color: "#7c53c3" },
  { slug: "boh", name: "Back of House", color: "#c8102e" },
  { slug: "food-safety", name: "Food Safety", color: "#14866d" },
  { slug: "guest-experience", name: "Guest Experience", color: "#e0a33c" },
  { slug: "leadership", name: "Leadership", color: "#0e1f38" },
  { slug: "operations", name: "Operations", color: "#3f7fa6" },
  { slug: "beverage", name: "Beverage", color: "#a2559b" },
  { slug: "menu", name: "Menu Knowledge", color: "#d2691e" },
  { slug: "lto", name: "Limited-Time Offers", color: "#c8102e" },
  { slug: "technology", name: "Technology", color: "#1d4ed8" },
  { slug: "safety", name: "Safety", color: "#a4620a" },
  { slug: "compliance", name: "Compliance", color: "#6b7280" },
  { slug: "policies", name: "Policies", color: "#475569" },
  { slug: "career", name: "Career Development", color: "#16794b" },
];

export interface SeedCourse {
  code: string;
  title: string;
  category: string;
  description: string;
  minutes: number;
  required: boolean;
  type: string;
  roles?: string[];
  objectives: string[];
  certification?: string;
  legacy?: boolean;
}

export const COURSES: SeedCourse[] = [
  { code: "WB-101", title: "Wahlburgers Orientation", category: "new-hire", type: "blended", minutes: 45, required: true, legacy: true,
    description: "Welcome to the family. Brand story, values, guest promise and what it means to work at Wahlburgers.",
    objectives: ["Describe the Wahlburgers brand story", "Explain the guest promise", "Identify day-one expectations"] },
  { code: "WB-102", title: "Food Safety Fundamentals", category: "food-safety", type: "scorm", minutes: 60, required: true, legacy: true, certification: "Food Safety Certified",
    description: "Core food safety practices: temperature control, cross-contamination, personal hygiene and cleaning standards.",
    objectives: ["Apply proper handwashing procedure", "Hold food at safe temperatures", "Prevent cross-contamination"] },
  { code: "WB-103", title: "Guest Experience Fundamentals", category: "guest-experience", type: "blended", minutes: 40, required: true, legacy: true,
    description: "How we greet, serve and recover. The Wahlburgers hospitality standard from door to door.",
    objectives: ["Deliver the Wahlburgers greeting", "Read the table", "Recover a guest issue"] },
  { code: "WB-104", title: "Cook Fundamentals: Quality, Safety & Execution", category: "boh", type: "blended", minutes: 75, required: true, legacy: true, certification: "Cook Certified", roles: ["hourly"],
    description: "Grill station execution, cook temps, build standards and speed with quality.",
    objectives: ["Execute the burger build to standard", "Hold cook times and temps", "Maintain station readiness"] },
  { code: "WB-105", title: "Host Position Training", category: "foh", type: "blended", minutes: 35, required: false, legacy: true, certification: "Host Certified",
    description: "Seating flow, waitlist management, phone standards and first impressions.",
    objectives: ["Manage the waitlist", "Seat to rotation", "Set the guest tone"] },
  { code: "WB-106", title: "Server Position Training", category: "foh", type: "blended", minutes: 55, required: false, legacy: true, certification: "Server Certified",
    description: "Steps of service, suggestive selling, allergen handling and table management.",
    objectives: ["Run the steps of service", "Handle allergen requests", "Sell the signature menu"] },
  { code: "WB-107", title: "Bartender Training", category: "beverage", type: "blended", minutes: 65, required: false, legacy: true, certification: "Bartender Certified",
    description: "Bar setup, cocktail specs, responsible alcohol service and bar guest experience.",
    objectives: ["Build core cocktails to spec", "Serve alcohol responsibly", "Run an efficient bar"] },
  { code: "WB-108", title: "Menu Knowledge Certification", category: "menu", type: "assessment", minutes: 30, required: true, legacy: true, certification: "Menu Knowledge Certified",
    description: "Know the menu cold: signature burgers, sides, shakes, allergens and modifiers.",
    objectives: ["Describe every signature item", "Identify allergens", "Answer guest menu questions"] },
  { code: "WB-109", title: "Manager Leadership Essentials", category: "leadership", type: "blended", minutes: 90, required: false, legacy: true,
    description: "Shift leadership, coaching conversations, scheduling basics and accountability.",
    objectives: ["Run a shift with intention", "Coach in the moment", "Hold the standard"] },
  { code: "WB-110", title: "Technology Systems Training", category: "technology", type: "video", minutes: 25, required: true, legacy: true,
    description: "POS, kitchen display, scheduling and the Wahlburgers Academy learner tools.",
    objectives: ["Navigate the POS", "Use the KDS", "Find your training"] },
  { code: "WB-111", title: "Workplace Safety", category: "safety", type: "scorm", minutes: 35, required: true, legacy: true,
    description: "Slips, trips, knife safety, burns, chemical handling and incident reporting.",
    objectives: ["Prevent common injuries", "Use chemicals safely", "Report an incident"] },
  { code: "WB-112", title: "Limited-Time Offer Training", category: "lto", type: "blended", minutes: 20, required: true,
    description: "Execute the current LTO: build, plating, pricing and the guest pitch.",
    objectives: ["Build the LTO to spec", "Describe the LTO to guests", "Merchandise the offer"] },
  { code: "WB-113", title: "Specialty Shakes: Fruity Pebbles & Kit Kat (Counter Service)", category: "lto", type: "scorm", minutes: 25, required: true,
    description: "Counter service execution for the Fruity Pebbles and Kit Kat specialty shakes.",
    objectives: ["Build both specialty shakes to spec", "Upsell shakes at the counter", "Hold quality and speed"] },
  { code: "WB-114", title: "Specialty Shakes: Fruity Pebbles & Kit Kat (Full Service)", category: "lto", type: "scorm", minutes: 25, required: true,
    description: "Full service execution for the Fruity Pebbles and Kit Kat specialty shakes.",
    objectives: ["Build both specialty shakes to spec", "Sell shakes tableside", "Hold quality and speed"] },
  { code: "WB-115", title: "Allergen Awareness & Guest Safety", category: "food-safety", type: "document", minutes: 20, required: true, legacy: true,
    description: "Identify the major allergens, take a safe order and communicate with the kitchen.",
    objectives: ["Identify the major allergens", "Take an allergy order", "Escalate correctly"] },
  { code: "WB-116", title: "Cash Handling & Point of Sale Accuracy", category: "operations", type: "blended", minutes: 30, required: false, legacy: true,
    description: "Drawer accountability, voids and comps, refunds and end-of-shift procedures.",
    objectives: ["Balance a drawer", "Process voids correctly", "Close a shift"] },
  { code: "WB-117", title: "Harassment Prevention & Respectful Workplace", category: "compliance", type: "scorm", minutes: 45, required: true, legacy: true, certification: "Compliance Current",
    description: "Required compliance training on a respectful, harassment-free workplace.",
    objectives: ["Recognize harassment", "Know reporting channels", "Support a respectful workplace"] },
  { code: "WB-118", title: "Alcohol Awareness & Responsible Service", category: "beverage", type: "scorm", minutes: 50, required: false, legacy: true, certification: "Alcohol Service Certified",
    description: "Checking IDs, recognizing intoxication and refusing service with confidence.",
    objectives: ["Verify identification", "Recognize intoxication signs", "Refuse service safely"] },
  { code: "WB-119", title: "Shift Leader Development", category: "career", type: "blended", minutes: 80, required: false, legacy: true,
    description: "Stepping up: pre-shift, floor control, delegation and problem solving.",
    objectives: ["Run a pre-shift meeting", "Control the floor", "Delegate effectively"] },
  { code: "WB-120", title: "Manager in Training: Operations Core", category: "leadership", type: "blended", minutes: 120, required: false,
    description: "Ordering, inventory, labor, food cost and the operational rhythm of the restaurant.",
    objectives: ["Place an order", "Take inventory", "Read a P&L line"] },
  { code: "WB-121", title: "Cleaning & Sanitation Standards", category: "food-safety", type: "document", minutes: 25, required: true, legacy: true,
    description: "Daily, weekly and deep-clean standards with the correct chemicals and dwell times.",
    objectives: ["Follow the cleaning matrix", "Use chemicals safely", "Verify sanitation"] },
  { code: "WB-122", title: "Fry Station Excellence", category: "boh", type: "video", minutes: 20, required: false, legacy: true,
    description: "Fry timing, oil management, holding standards and portioning.",
    objectives: ["Manage oil quality", "Hold fry standards", "Portion accurately"] },
  { code: "WB-123", title: "Expo & Ticket Times", category: "boh", type: "blended", minutes: 30, required: false,
    description: "Reading the board, quality checks at the pass and ticket time management.",
    objectives: ["Run the pass", "Hold quality checks", "Manage ticket times"] },
  { code: "WB-124", title: "Brand Standards & Restaurant Presentation", category: "operations", type: "document", minutes: 20, required: false, legacy: true,
    description: "Uniform, music, lighting, cleanliness and the Wahlburgers look and feel.",
    objectives: ["Meet uniform standards", "Maintain restaurant presentation", "Audit your section"] },
  { code: "WB-125", title: "Team Member Handbook Acknowledgment", category: "policies", type: "document", minutes: 15, required: true, legacy: true,
    description: "Review and acknowledge the team member handbook and core policies.",
    objectives: ["Understand core policies", "Know where to find HR support", "Acknowledge the handbook"] },
  { code: "WB-126", title: "Guest Recovery & Service Recovery Scripts", category: "guest-experience", type: "blended", minutes: 25, required: false,
    description: "Turning a problem into loyalty with the LEARN recovery model.",
    objectives: ["Apply the LEARN model", "Empower a recovery", "Follow up with the guest"] },
  { code: "WB-127", title: "General Manager Certification Capstone", category: "career", type: "assessment", minutes: 60, required: false,
    description: "Capstone assessment and manager validation for the General Manager Certification path.",
    objectives: ["Demonstrate operational mastery", "Pass the GM capstone", "Complete manager validation"] },
  { code: "WB-128", title: "New Hire Day One Checklist", category: "new-hire", type: "checklist", minutes: 15, required: true,
    description: "Day one orientation checklist completed with the manager on the floor.",
    objectives: ["Tour the restaurant", "Meet the team", "Complete day-one setup"] },
];

export const CERTIFICATIONS = [
  { name: "Food Safety Certified", months: 24, description: "Systemwide food safety certification required for all team members." },
  { name: "Cook Certified", months: 12, description: "Grill and kitchen station certification with manager validation." },
  { name: "Host Certified", months: 12, description: "Host stand certification covering flow, waitlist and first impressions." },
  { name: "Server Certified", months: 12, description: "Full steps-of-service certification for servers." },
  { name: "Bartender Certified", months: 12, description: "Bar certification covering specs, speed and responsible service." },
  { name: "Menu Knowledge Certified", months: 12, description: "Verified knowledge of the full Wahlburgers menu." },
  { name: "Alcohol Service Certified", months: 36, description: "Responsible alcohol service certification." },
  { name: "Compliance Current", months: 12, description: "Annual respectful workplace and compliance certification." },
  { name: "Manager Development Graduate", months: 36, description: "Completion of the manager development curriculum." },
];

export const BADGES = [
  { name: "Wahlburgers Academy Graduate", description: "Completed the full new hire curriculum.", criteria: "Complete New Hire Orientation learning path", icon: "graduation-cap", color: "#1e5fbf" },
  { name: "Cook Certified", description: "Earned the Cook Certification.", criteria: "Earn Cook Certified certification", icon: "chef-hat", color: "#c8102e" },
  { name: "Host Certified", description: "Earned the Host Certification.", criteria: "Earn Host Certified certification", icon: "concierge-bell", color: "#7c53c3" },
  { name: "Guest Experience Champion", description: "Top guest experience scores across the team.", criteria: "Score 95%+ on guest experience training", icon: "heart-handshake", color: "#e0a33c" },
  { name: "Food Safety Champion", description: "Perfect food safety record and certification.", criteria: "Food safety certification current with 100% score", icon: "shield-check", color: "#14866d" },
  { name: "Training All-Star", description: "Completed 10+ courses.", criteria: "Complete 10 courses", icon: "star", color: "#e0a33c" },
  { name: "Manager Development Graduate", description: "Completed the manager development path.", criteria: "Complete Manager in Training learning path", icon: "briefcase", color: "#0e1f38" },
  { name: "100% Training Completion", description: "All required training complete and current.", criteria: "0 overdue and 100% required completion", icon: "circle-check", color: "#16794b" },
  { name: "Learning Streak", description: "Training completed 4 weeks in a row.", criteria: "Complete training in 4 consecutive weeks", icon: "flame", color: "#c8102e" },
];

export const LEARNING_PATHS = [
  { name: "New Hire Orientation", category: "new-hire", color: "#1e5fbf", courses: ["WB-101", "WB-125", "WB-102", "WB-110", "WB-128"], certification: null },
  { name: "Cook Certification", category: "boh", color: "#c8102e", courses: ["WB-104", "WB-102", "WB-121", "WB-122", "WB-123"], certification: "Cook Certified" },
  { name: "Host Certification", category: "foh", color: "#7c53c3", courses: ["WB-105", "WB-103", "WB-108"], certification: "Host Certified" },
  { name: "Server Certification", category: "foh", color: "#3f7fa6", courses: ["WB-106", "WB-103", "WB-108", "WB-115"], certification: "Server Certified" },
  { name: "Bartender Certification", category: "beverage", color: "#a2559b", courses: ["WB-107", "WB-118", "WB-108"], certification: "Bartender Certified" },
  { name: "Shift Leader Development", category: "career", color: "#16794b", courses: ["WB-119", "WB-116", "WB-126"], certification: null },
  { name: "Manager in Training", category: "leadership", color: "#0e1f38", courses: ["WB-109", "WB-120", "WB-116", "WB-117"], certification: "Manager Development Graduate" },
  { name: "General Manager Certification", category: "career", color: "#e0a33c", courses: ["WB-120", "WB-109", "WB-127"], certification: "Manager Development Graduate" },
];

export const RESOURCES = [
  { name: "Wahlburgers Brand Standards Manual", type: "pdf", category: "Brand Standards", tags: ["brand", "standards"] },
  { name: "Grill Station Position Guide", type: "pdf", category: "Position Guides", tags: ["boh", "grill"] },
  { name: "Fry Station Position Guide", type: "pdf", category: "Position Guides", tags: ["boh", "fry"] },
  { name: "Host Stand Position Guide", type: "pdf", category: "Position Guides", tags: ["foh", "host"] },
  { name: "Server Position Guide", type: "pdf", category: "Position Guides", tags: ["foh", "server"] },
  { name: "Signature Burger Recipe Guide", type: "pdf", category: "Recipe Guides", tags: ["menu", "recipes"] },
  { name: "Specialty Shake Build Sheets", type: "pdf", category: "Recipe Guides", tags: ["menu", "shakes", "lto"] },
  { name: "Food Safety Quick Reference", type: "pdf", category: "Food Safety", tags: ["food-safety", "temps"] },
  { name: "Daily Cleaning Matrix", type: "document", category: "SOPs", tags: ["cleaning", "sanitation"] },
  { name: "Opening & Closing Checklists", type: "checklist", category: "SOPs", tags: ["operations"] },
  { name: "Team Member Handbook", type: "policy", category: "Policies", tags: ["policy", "hr"] },
  { name: "Allergen Reference Chart", type: "pdf", category: "Food Safety", tags: ["allergen", "menu"] },
  { name: "POS Quick Start Job Aid", type: "job_aid", category: "Technology", tags: ["pos", "technology"] },
  { name: "Kitchen Display System Job Aid", type: "job_aid", category: "Technology", tags: ["kds", "technology"] },
  { name: "Vendor & Ordering Guide", type: "document", category: "Operations Manuals", tags: ["ordering", "vendors"] },
  { name: "LTO Merchandising Kit", type: "presentation", category: "Limited-Time Offers", tags: ["lto", "marketing"] },
];

export const FIRST_NAMES = [
  "Amara","Diego","Kayla","Marcus","Priya","Renee","Victor","Alan","Dana","Jasmine","Tyler","Sofia","Andre","Nina","Colton",
  "Leila","Marcus","Oscar","Hannah","Devin","Camille","Grant","Imani","Julian","Kendra","Luis","Maya","Nolan","Opal","Preston",
  "Quinn","Rosa","Sean","Tessa","Umar","Vera","Wyatt","Xiomara","Yusuf","Zara","Blake","Carmen","Dylan","Elena","Felix",
  "Gia","Harper","Isaac","Jade","Keegan","Lena","Miles","Naomi","Owen","Paloma","Reid","Selena","Theo","Uma","Vince",
  "Willa","Xavier","Yara","Zane","Adrian","Brooke","Cody","Daphne","Emmett","Farrah","Gavin","Hazel","Ivan","Josie",
  "Kai","Liam","Mira","Noel","Odette","Pablo","Rhea","Simone","Tobias","Ursula","Vaughn","Wren","Yvette","Zeke",
];

export const LAST_NAMES = [
  "Alvarez","Bennett","Carter","Delgado","Ellery","Fontaine","Garrison","Hollis","Ibarra","Jennings","Kowalski","Lindqvist",
  "Mercado","Nguyen","Okafor","Pearson","Quintero","Ramsey","Sandoval","Torres","Underwood","Vance","Whitfield","Xiong",
  "Yates","Zamora","Ashford","Brennan","Calloway","Donovan","Espinoza","Faulkner","Griffin","Hastings","Ingram","Jarrett",
  "Keller","Lamont","Maddox","Novak","Oakley","Pryor","Quimby","Rivas","Sutherland","Tran","Ulrich","Vasquez","Winslow","Zhang",
];

export const POSITIONS: Array<{ role: string; title: string; dept: string; weight: number }> = [
  { role: "hourly", title: "Cook", dept: "BOH", weight: 22 },
  { role: "hourly", title: "Prep Cook", dept: "BOH", weight: 8 },
  { role: "hourly", title: "Dishwasher", dept: "BOH", weight: 6 },
  { role: "hourly", title: "Server", dept: "FOH", weight: 20 },
  { role: "hourly", title: "Host", dept: "FOH", weight: 9 },
  { role: "hourly", title: "Busser", dept: "FOH", weight: 5 },
  { role: "hourly", title: "Bartender", dept: "BAR", weight: 8 },
  { role: "shift_leader", title: "Shift Leader", dept: "MGMT", weight: 7 },
  { role: "dept_manager", title: "Kitchen Manager", dept: "MGMT", weight: 4 },
  { role: "training_manager", title: "Training Manager", dept: "TRN", weight: 3 },
  { role: "agm", title: "Assistant General Manager", dept: "MGMT", weight: 4 },
];

export const FEED_POSTS = [
  { type: "recognition", title: "Shout out to the Boston Seaport crew", body: "100% of the Seaport team finished Food Safety Fundamentals before the deadline. That is how we protect our guests. Nice work, team." },
  { type: "new_training", title: "Specialty Shakes training is live", body: "The Fruity Pebbles and Kit Kat specialty shake modules are now in the Academy. Counter service and full service versions are both assigned — check My Learning." },
  { type: "tip", title: "Shake build tip from Nashville", body: "Chill your cups for 10 minutes before the rush. Holds the swirl and cuts remakes almost in half on a busy Saturday." },
  { type: "best_practice", title: "Pre-shift that actually sticks", body: "We started running a 3-minute pre-shift on one menu item per day. Menu Knowledge scores at Charlotte Uptown jumped 14 points in a month." },
  { type: "celebration", title: "Congratulations to our newest Cook Certified team members", body: "Eleven team members earned Cook Certification this month across the Lakeshore group. Grill mastery on display." },
  { type: "training_update", title: "Allergen training refresh", body: "Allergen Awareness has been updated with the new menu items. Everyone with the course assigned will see version 2 in their queue." },
  { type: "photo", title: "LTO launch day at Miami Brickell", body: "The team went all in on the LTO launch. Merchandising on point and shakes flying out the window." },
  { type: "announcement", title: "Academy Feed is open", body: "Welcome to the Wahlburgers Academy Feed. Share wins, tips and best practices with the whole system here." },
];

export const REVIEW_COMMENTS = [
  "Clear and quick. The videos matched exactly what we do on the line.",
  "Really useful — I felt ready on my first shift after this.",
  "Good content. Would love more real kitchen footage.",
  "The knowledge check was fair and the feedback helped.",
  "Best training I have taken here. Straight to the point.",
  "Helpful, but I had to rewatch the temperature section twice.",
  "Loved the scenarios — they felt like real guest situations.",
  "Great refresher before the LTO launch.",
];
