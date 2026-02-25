import { LearningInterestArea, LearningTopic } from "../models";

const minutes = 15;

const software: LearningTopic[] = [
  {
    key: "software:http-request-lifecycle",
    interestArea: "software",
    title: "HTTP request lifecycle (15 minutes)",
    overview: "Understand what happens between typing a URL and seeing a rendered page.",
    minutes,
    plan: [
      "Sketch the path: DNS → TCP/TLS → HTTP request → server → response → browser render.",
      "Explain status codes 200/301/304/404/500 in one sentence each.",
      "Mini exercise: open DevTools → Network on any site and identify: request method, headers, status, timing."
    ],
    quizPrompts: [
      "What’s the difference between DNS lookup and the TCP connection?",
      "When would you see a 304 response and why is it useful?",
      "Name 3 things that can make Time To First Byte slow."
    ],
    takeaways: ["Browsers do more than 'download HTML'.", "Caching and TLS often dominate early timings.", "DevTools is your fastest debugging tool."],
    resources: [{ label: "MDN: HTTP overview", url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Overview" }]
  },
  {
    key: "software:sql-indexes-101",
    interestArea: "software",
    title: "SQL indexes 101 (15 minutes)",
    overview: "Learn when indexes help, when they hurt, and how to reason about them.",
    minutes,
    plan: [
      "Define an index in 1 sentence and list 2 tradeoffs.",
      "Understand B-tree basics: sorted structure enabling faster lookups/ranges.",
      "Mini exercise: pick a frequently filtered column and decide if an index helps (high cardinality? selective?)."
    ],
    quizPrompts: [
      "Why can adding an index slow down writes?",
      "What kinds of queries benefit most from a B-tree index?",
      "What is 'selectivity' and why does it matter for indexes?"
    ],
    takeaways: ["Indexes are about access patterns.", "They trade space + write cost for read speed.", "Measure with EXPLAIN/ANALYZE when possible."],
    resources: [{ label: "Postgres: Indexes", url: "https://www.postgresql.org/docs/current/indexes.html" }]
  },
  {
    key: "software:git-rebase-vs-merge",
    interestArea: "software",
    title: "Git rebase vs merge (15 minutes)",
    overview: "Know when to rebase, when to merge, and how to avoid common pitfalls.",
    minutes,
    plan: [
      "Write down what a commit graph looks like with merge vs rebase.",
      "Memorize the rule: never rebase shared public history.",
      "Mini exercise: explain what `git rebase main` does to your branch."
    ],
    quizPrompts: [
      "What does a merge commit represent?",
      "Why is rebasing a published branch dangerous?",
      "When is a fast-forward merge possible?"
    ],
    takeaways: ["Merge preserves history; rebase rewrites it.", "Rebase is great for local cleanup.", "Be explicit about team workflow."],
    resources: [{ label: "Git book: Rebasing", url: "https://git-scm.com/book/en/v2/Git-Branching-Rebasing" }]
  },
  {
    key: "software:big-o-cheat-sheet",
    interestArea: "software",
    title: "Big-O sanity check (15 minutes)",
    overview: "A quick mental toolkit for comparing algorithm cost and spotting 'slow by design' code.",
    minutes,
    plan: [
      "List O(1), O(log n), O(n), O(n log n), O(n^2) with a real-world example each.",
      "Identify 2 nested loops you’ve written recently and estimate complexity.",
      "Mini exercise: explain why binary search is O(log n)."
    ],
    quizPrompts: ["What makes hash maps 'usually' O(1) but sometimes worse?", "When can O(n^2) still be fine?", "Why is sorting typically O(n log n)?"],
    takeaways: ["Big-O is about growth, not constant factors.", "Use it to reason before optimizing.", "Real performance needs measurement."],
    resources: [{ label: "Big-O cheat sheet", url: "https://www.bigocheatsheet.com/" }]
  },
  {
    key: "software:oauth-vs-jwt",
    interestArea: "software",
    title: "OAuth vs JWT (15 minutes)",
    overview: "Stop mixing up authentication and authorization; understand the role JWT can play.",
    minutes,
    plan: [
      "Define authentication vs authorization.",
      "Explain OAuth as 'delegated authorization' with a 1-sentence example.",
      "Explain JWT as a token format; list 2 risks if used incorrectly."
    ],
    quizPrompts: ["Is OAuth a protocol for login? Why/why not?", "What does it mean that a JWT is 'self-contained'?", "Name 2 reasons to prefer opaque tokens."],
    takeaways: ["OAuth ≠ 'JWT'.", "JWT is a format; OAuth is a flow.", "Token storage/rotation matters more than token format."],
    resources: [{ label: "OAuth 2.0 overview", url: "https://oauth.net/2/" }]
  }
];

const hardware: LearningTopic[] = [
  {
    key: "hardware:cpu-cache-basics",
    interestArea: "hardware",
    title: "CPU caches (15 minutes)",
    overview: "Learn why L1/L2/L3 caches exist and how they impact real-world speed.",
    minutes,
    plan: [
      "Define latency vs throughput with a cache example.",
      "Explain cache lines and why 'memory locality' matters.",
      "Mini exercise: name 2 coding patterns that improve locality (sequential arrays, batching)."
    ],
    quizPrompts: ["Why is RAM slower than cache?", "What is a cache miss?", "How can data structures affect cache performance?"],
    takeaways: ["Caches exist because CPU is faster than RAM.", "Locality is the performance superpower.", "Simple layouts often beat clever pointers."],
    resources: [{ label: "Wikipedia: CPU cache", url: "https://en.wikipedia.org/wiki/CPU_cache" }]
  },
  {
    key: "hardware:ram-vs-storage",
    interestArea: "hardware",
    title: "RAM vs SSD vs HDD (15 minutes)",
    overview: "Understand memory hierarchy and what 'volatile' really means for your computer.",
    minutes,
    plan: [
      "List the hierarchy: registers → cache → RAM → SSD → HDD.",
      "Explain volatile vs non-volatile storage.",
      "Mini exercise: think of 3 symptoms of being RAM-limited (swapping, stutter, slow app switching)."
    ],
    quizPrompts: ["Why does adding RAM sometimes speed up everything?", "What is swapping/paging?", "Why is SSD faster than HDD?"],
    takeaways: ["RAM is workspace; SSD is filing cabinet.", "Running out of RAM forces slow disk IO.", "Storage speed shows up under load."],
    resources: [{ label: "Wikipedia: Memory hierarchy", url: "https://en.wikipedia.org/wiki/Memory_hierarchy" }]
  },
  {
    key: "hardware:usb-c-explained",
    interestArea: "hardware",
    title: "USB‑C: connector vs capabilities (15 minutes)",
    overview: "Learn why 'USB‑C' doesn’t guarantee charging speed, data speed, or video support.",
    minutes,
    plan: [
      "Separate connector (USB‑C) from protocols (USB 2/3/4, Thunderbolt).",
      "Learn Power Delivery basics: negotiated voltage/current.",
      "Mini exercise: list what you need for 'single cable dock': PD + video alt-mode + enough bandwidth."
    ],
    quizPrompts: ["Why can two USB‑C cables behave differently?", "What does USB Power Delivery do?", "What is DisplayPort Alt Mode?"],
    takeaways: ["USB‑C is a shape, not a guarantee.", "Cables matter.", "Labels/spec sheets are worth checking."],
    resources: [{ label: "USB-C FAQ (Wikipedia)", url: "https://en.wikipedia.org/wiki/USB-C" }]
  },
  {
    key: "hardware:gpu-vs-cpu",
    interestArea: "hardware",
    title: "CPU vs GPU (15 minutes)",
    overview: "Understand why GPUs excel at parallel workloads and where CPUs still win.",
    minutes,
    plan: [
      "Define 'parallelism' and 'SIMD/SIMT' at a high level.",
      "List 3 GPU-friendly workloads (graphics, matrix math, ML inference).",
      "Mini exercise: explain why branching hurts GPU performance."
    ],
    quizPrompts: ["Why are GPUs good at matrix multiplication?", "What is a 'core' difference between CPU and GPU?", "Name a workload that stays CPU-bound and why."],
    takeaways: ["GPUs trade flexibility for throughput.", "CPUs handle complex control flow better.", "Data transfer can dominate performance."],
    resources: [{ label: "Wikipedia: GPU", url: "https://en.wikipedia.org/wiki/Graphics_processing_unit" }]
  }
];

const trivia: LearningTopic[] = [
  {
    key: "trivia:moon-phases",
    interestArea: "trivia",
    title: "Moon phases (15 minutes)",
    overview: "Learn the 8 phases and why the Moon looks different through the month.",
    minutes,
    plan: [
      "Draw the Sun–Earth–Moon diagram and label new moon / full moon.",
      "Memorize: waxing = growing light, waning = shrinking light.",
      "Mini exercise: explain why eclipses don’t happen every month."
    ],
    quizPrompts: ["What causes moon phases?", "What’s the difference between waxing and waning?", "Why aren’t lunar eclipses monthly?"],
    takeaways: ["Phases are geometry, not Earth's shadow.", "Waxing/waning is about visible sunlight.", "Orbital tilt prevents constant eclipses."],
    resources: [{ label: "NASA: Moon phases", url: "https://moon.nasa.gov/moon-in-motion/moon-phases/" }]
  },
  {
    key: "trivia:roman-numerals",
    interestArea: "trivia",
    title: "Roman numerals (15 minutes)",
    overview: "Learn the rules well enough to read dates, clocks, and movie credits.",
    minutes,
    plan: [
      "Memorize I,V,X,L,C,D,M and their values.",
      "Learn subtraction rule: IV=4, IX=9, XL=40, etc.",
      "Mini exercise: convert 2026 and 1999 both ways."
    ],
    quizPrompts: ["Write 2026 in Roman numerals.", "Why is 4 written IV instead of IIII (usually)?", "Convert MCMLXXXIV to Arabic."],
    takeaways: ["Roman numerals are mostly additive.", "Subtractive pairs are a compact notation.", "A little practice makes it automatic."],
    resources: [{ label: "Roman numerals (Wikipedia)", url: "https://en.wikipedia.org/wiki/Roman_numerals" }]
  },
  {
    key: "trivia:periodic-table-shortcuts",
    interestArea: "trivia",
    title: "Periodic table shortcuts (15 minutes)",
    overview: "Recognize the big groups (alkali metals, halogens, noble gases) and common elements.",
    minutes,
    plan: [
      "Learn 3 rows of common elements: H, C, N, O, Na, Cl, Fe, Cu, Ag, Au.",
      "Understand groups: noble gases are inert; halogens form salts; alkali metals react strongly.",
      "Mini exercise: name one everyday item tied to each (He balloons, NaCl salt, Fe steel)."
    ],
    quizPrompts: ["Why are noble gases called 'noble'?", "What group is chlorine in?", "Name 3 elements you encounter daily and where."],
    takeaways: ["Groups predict behavior.", "A few elements cover most daily life.", "Chemistry patterns repeat down columns."],
    resources: [{ label: "Periodic table (Wikipedia)", url: "https://en.wikipedia.org/wiki/Periodic_table" }]
  }
];

const allTopics: LearningTopic[] = [...software, ...hardware, ...trivia];
const topicByKey = new Map(allTopics.map((topic) => [topic.key, topic]));

export function listLearningTopics(area: LearningInterestArea): LearningTopic[] {
  return allTopics.filter((topic) => topic.interestArea === area);
}

export function getLearningTopic(key: string): LearningTopic | null {
  return topicByKey.get(key) ?? null;
}

export function fallbackDefaultArea(): LearningInterestArea {
  return "software";
}

