export type RoleFamily =
  | "frontend"
  | "backend"
  | "fullstack"
  | "java"
  | "python"
  | "ai-ml"
  | "data"
  | "devops"
  | "cloud"
  | "qa"
  | "mobile"
  | "ui-ux"
  | "product"
  | "marketing"
  | "finance"
  | "hr"
  | "general";

// ============================================================
// SENIORITY
// ============================================================

export interface RoleSenioritySignals {
  entry: string[];
  mid: string[];
  senior: string[];
  lead: string[];
}

const DEFAULT_SENIORITY_SIGNALS: RoleSenioritySignals = {
  entry: ["built", "developed", "implemented", "created", "integrated"],

  mid: ["designed", "optimized", "refactored", "owned", "automated"],

  senior: ["architected", "scaled", "led", "drove", "established"],

  lead: [
    "technical leadership",
    "engineering strategy",
    "architecture",
    "mentored engineers",
    "cross-functional leadership",
  ],
};

// ============================================================
// ROLE PROFILE
// ============================================================

export interface RoleIntelligenceProfile {
  id: string;

  name: string;

  family: RoleFamily;

  aliases: string[];

  coreSkills: string[];

  supportingSkills: string[];

  tools: string[];

  concepts: string[];

  responsibilities: string[];

  keywords: string[];

  senioritySignals: RoleSenioritySignals;

  preferredSections: string[];

  projectSignals: string[];

  achievementSignals: string[];

  benchmarkAvailable: boolean;
}

// ============================================================
// HELPERS
// ============================================================

const unique = (values: string[]): string[] => {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean)),
  );
};

const createSenioritySignals = (
  overrides: Partial<RoleSenioritySignals> = {},
): RoleSenioritySignals => {
  return {
    entry: unique([
      ...DEFAULT_SENIORITY_SIGNALS.entry,
      ...(overrides.entry ?? []),
    ]),

    mid: unique([...DEFAULT_SENIORITY_SIGNALS.mid, ...(overrides.mid ?? [])]),

    senior: unique([
      ...DEFAULT_SENIORITY_SIGNALS.senior,
      ...(overrides.senior ?? []),
    ]),

    lead: unique([
      ...DEFAULT_SENIORITY_SIGNALS.lead,
      ...(overrides.lead ?? []),
    ]),
  };
};

// ============================================================
// FRONTEND DEVELOPER
// ============================================================

const FRONTEND_DEVELOPER: RoleIntelligenceProfile = {
  id: "frontend-developer",

  name: "Frontend Developer",

  family: "frontend",

  aliases: [
    "frontend developer",
    "front end developer",
    "frontend engineer",
    "front end engineer",
    "react developer",
    "react engineer",
    "ui developer",
    "web developer",
  ],

  coreSkills: ["HTML", "CSS", "JavaScript", "TypeScript", "React"],

  supportingSkills: [
    "Next.js",
    "Redux",
    "Redux Toolkit",
    "Tailwind CSS",
    "Responsive Design",
    "REST API",
    "Accessibility",
    "Web Performance",
    "Testing",
    "Git",
  ],

  tools: [
    "Vite",
    "Webpack",
    "Babel",
    "Jest",
    "Vitest",
    "Cypress",
    "Playwright",
    "npm",
    "Yarn",
    "Git",
    "GitHub",
  ],

  concepts: [
    "component architecture",
    "state management",
    "responsive design",
    "accessibility",
    "performance optimization",
    "browser compatibility",
    "api integration",
    "authentication",
    "authorization",
    "web security",
  ],

  responsibilities: [
    "build user interfaces",
    "develop reusable components",
    "integrate APIs",
    "implement responsive layouts",
    "optimize frontend performance",
    "fix UI bugs",
    "write maintainable frontend code",
    "collaborate with backend developers",
  ],

  keywords: [
    "frontend",
    "web application",
    "user interface",
    "ui",
    "react",
    "javascript",
    "typescript",
    "html",
    "css",
    "rest api",
    "responsive",
    "performance",
    "accessibility",
    "git",
    "testing",
  ],

  senioritySignals: createSenioritySignals(),

  preferredSections: [
    "summary",
    "skills",
    "experience",
    "projects",
    "education",
    "certifications",
  ],

  projectSignals: [
    "web application",
    "dashboard",
    "e-commerce",
    "saas",
    "responsive",
    "react application",
    "api integration",
    "authentication",
    "performance",
  ],

  achievementSignals: [
    "performance improvement",
    "load time reduction",
    "conversion improvement",
    "user growth",
    "latency reduction",
    "accessibility improvement",
  ],

  benchmarkAvailable: true,
};

// ============================================================
// BACKEND DEVELOPER
// ============================================================

const BACKEND_DEVELOPER: RoleIntelligenceProfile = {
  id: "backend-developer",

  name: "Backend Developer",

  family: "backend",

  aliases: [
    "backend developer",
    "back end developer",
    "backend engineer",
    "back end engineer",
    "server side developer",
    "node.js developer",
    "node developer",
  ],

  coreSkills: ["Node.js", "Express", "REST API", "Databases", "Authentication"],

  supportingSkills: [
    "TypeScript",
    "JavaScript",
    "MongoDB",
    "PostgreSQL",
    "MySQL",
    "Redis",
    "Docker",
    "Testing",
    "Git",
    "API Design",
  ],

  tools: [
    "Postman",
    "Docker",
    "Git",
    "GitHub",
    "npm",
    "Jest",
    "Redis",
    "MongoDB Atlas",
  ],

  concepts: [
    "REST",
    "API architecture",
    "authentication",
    "authorization",
    "JWT",
    "RBAC",
    "database design",
    "caching",
    "error handling",
    "logging",
    "security",
    "scalability",
    "performance",
  ],

  responsibilities: [
    "design backend services",
    "build APIs",
    "design database schemas",
    "implement authentication",
    "implement authorization",
    "integrate third-party services",
    "optimize backend performance",
    "write automated tests",
    "debug production issues",
  ],

  keywords: [
    "backend",
    "server",
    "api",
    "rest",
    "node.js",
    "express",
    "database",
    "mongodb",
    "postgresql",
    "authentication",
    "authorization",
    "jwt",
    "docker",
    "redis",
    "git",
  ],

  senioritySignals: createSenioritySignals(),

  preferredSections: [
    "summary",
    "skills",
    "experience",
    "projects",
    "education",
    "certifications",
  ],

  projectSignals: [
    "rest api",
    "authentication",
    "database",
    "microservices",
    "backend service",
    "payment integration",
    "real-time application",
    "scalable system",
  ],

  achievementSignals: [
    "latency reduction",
    "throughput improvement",
    "response time reduction",
    "cost reduction",
    "uptime improvement",
    "scalability improvement",
  ],

  benchmarkAvailable: true,
};

// ============================================================
// FULL STACK DEVELOPER
// ============================================================

const FULLSTACK_DEVELOPER: RoleIntelligenceProfile = {
  id: "fullstack-developer",

  name: "Full Stack Developer",

  family: "fullstack",

  aliases: [
    "full stack developer",
    "full-stack developer",
    "fullstack developer",
    "full stack engineer",
    "full-stack engineer",
    "mern developer",
    "mean developer",
  ],

  coreSkills: [
    "JavaScript",
    "TypeScript",
    "React",
    "Node.js",
    "REST API",
    "Database",
  ],

  supportingSkills: [
    "Express",
    "MongoDB",
    "PostgreSQL",
    "Next.js",
    "HTML",
    "CSS",
    "Git",
    "Docker",
    "Authentication",
    "Testing",
  ],

  tools: [
    "Vite",
    "npm",
    "Git",
    "GitHub",
    "Docker",
    "Postman",
    "Jest",
    "MongoDB Atlas",
  ],

  concepts: [
    "frontend development",
    "backend development",
    "api integration",
    "database design",
    "authentication",
    "authorization",
    "deployment",
    "web security",
    "performance",
    "scalability",
  ],

  responsibilities: [
    "develop frontend applications",
    "develop backend services",
    "integrate APIs",
    "design databases",
    "implement authentication",
    "deploy applications",
    "debug end-to-end issues",
    "build complete web applications",
  ],

  keywords: [
    "full stack",
    "react",
    "node.js",
    "express",
    "javascript",
    "typescript",
    "mongodb",
    "rest api",
    "html",
    "css",
    "git",
    "docker",
    "authentication",
  ],

  senioritySignals: createSenioritySignals(),

  preferredSections: [
    "summary",
    "skills",
    "experience",
    "projects",
    "education",
  ],

  projectSignals: [
    "full stack application",
    "saas",
    "e-commerce",
    "dashboard",
    "authentication",
    "payment integration",
    "rest api",
  ],

  achievementSignals: [
    "performance improvement",
    "user growth",
    "conversion improvement",
    "latency reduction",
    "cost reduction",
  ],

  benchmarkAvailable: true,
};

// ============================================================
// JAVA DEVELOPER
// ============================================================

const JAVA_DEVELOPER: RoleIntelligenceProfile = {
  id: "java-developer",

  name: "Java Developer",

  family: "java",

  aliases: [
    "java developer",
    "java engineer",
    "java backend developer",
    "java backend engineer",
    "spring boot developer",
  ],

  coreSkills: [
    "Java",
    "Spring Boot",
    "REST API",
    "SQL",
    "Object-Oriented Programming",
  ],

  supportingSkills: [
    "Spring",
    "Hibernate",
    "JPA",
    "Maven",
    "Gradle",
    "JUnit",
    "Git",
    "Microservices",
    "Docker",
  ],

  tools: [
    "IntelliJ IDEA",
    "Eclipse",
    "Maven",
    "Gradle",
    "Git",
    "GitHub",
    "Postman",
    "Docker",
  ],

  concepts: [
    "OOP",
    "data structures",
    "design patterns",
    "REST",
    "microservices",
    "database design",
    "concurrency",
    "exception handling",
    "security",
    "scalability",
  ],

  responsibilities: [
    "develop Java applications",
    "build REST APIs",
    "implement business logic",
    "design database integrations",
    "write automated tests",
    "debug applications",
    "optimize application performance",
  ],

  keywords: [
    "java",
    "spring boot",
    "spring",
    "rest",
    "sql",
    "hibernate",
    "jpa",
    "maven",
    "junit",
    "microservices",
    "docker",
    "git",
  ],

  senioritySignals: createSenioritySignals(),

  preferredSections: [
    "summary",
    "skills",
    "experience",
    "projects",
    "education",
    "certifications",
  ],

  projectSignals: [
    "spring boot",
    "rest api",
    "microservices",
    "database",
    "enterprise application",
  ],

  achievementSignals: [
    "latency reduction",
    "throughput improvement",
    "performance improvement",
    "cost reduction",
  ],

  benchmarkAvailable: true,
};

// ============================================================
// PYTHON DEVELOPER
// ============================================================

const PYTHON_DEVELOPER: RoleIntelligenceProfile = {
  id: "python-developer",

  name: "Python Developer",

  family: "python",

  aliases: [
    "python developer",
    "python engineer",
    "python backend developer",
    "python backend engineer",
  ],

  coreSkills: ["Python", "REST API", "SQL", "Object-Oriented Programming"],

  supportingSkills: [
    "FastAPI",
    "Django",
    "Flask",
    "PostgreSQL",
    "MongoDB",
    "Pytest",
    "Docker",
    "Git",
    "Redis",
  ],

  tools: [
    "PyCharm",
    "VS Code",
    "pip",
    "Poetry",
    "Docker",
    "Git",
    "Postman",
    "Pytest",
  ],

  concepts: [
    "OOP",
    "API development",
    "database design",
    "authentication",
    "testing",
    "async programming",
    "caching",
    "security",
    "scalability",
  ],

  responsibilities: [
    "develop Python applications",
    "build APIs",
    "implement business logic",
    "integrate databases",
    "write tests",
    "debug applications",
    "optimize performance",
  ],

  keywords: [
    "python",
    "fastapi",
    "django",
    "flask",
    "rest api",
    "sql",
    "postgresql",
    "mongodb",
    "pytest",
    "docker",
    "git",
  ],

  senioritySignals: createSenioritySignals(),

  preferredSections: [
    "summary",
    "skills",
    "experience",
    "projects",
    "education",
  ],

  projectSignals: [
    "api",
    "backend",
    "automation",
    "web application",
    "data processing",
  ],

  achievementSignals: [
    "automation time reduction",
    "performance improvement",
    "latency reduction",
    "cost reduction",
  ],

  benchmarkAvailable: true,
};

// ============================================================
// AI / ML ENGINEER
// ============================================================

const AI_ML_ENGINEER: RoleIntelligenceProfile = {
  id: "ai-ml-engineer",

  name: "AI/ML Engineer",

  family: "ai-ml",

  aliases: [
    "ai engineer",
    "ml engineer",
    "machine learning engineer",
    "artificial intelligence engineer",
    "ai ml engineer",
    "ai/ml engineer",
  ],

  coreSkills: [
    "Python",
    "Machine Learning",
    "Data Structures",
    "Statistics",
    "Model Development",
  ],

  supportingSkills: [
    "NumPy",
    "Pandas",
    "Scikit-learn",
    "TensorFlow",
    "PyTorch",
    "SQL",
    "Deep Learning",
    "NLP",
    "Computer Vision",
    "Git",
  ],

  tools: [
    "Jupyter",
    "MLflow",
    "Docker",
    "Git",
    "GitHub",
    "Google Colab",
    "AWS",
    "Azure",
  ],

  concepts: [
    "supervised learning",
    "unsupervised learning",
    "deep learning",
    "model evaluation",
    "feature engineering",
    "model deployment",
    "data preprocessing",
    "statistics",
    "NLP",
    "computer vision",
    "MLOps",
  ],

  responsibilities: [
    "develop machine learning models",
    "prepare datasets",
    "engineer features",
    "evaluate models",
    "deploy models",
    "monitor model performance",
    "build AI solutions",
    "optimize model performance",
  ],

  keywords: [
    "AI",
    "machine learning",
    "Python",
    "deep learning",
    "NLP",
    "computer vision",
    "TensorFlow",
    "PyTorch",
    "scikit-learn",
    "Pandas",
    "NumPy",
    "MLOps",
  ],

  senioritySignals: createSenioritySignals({
    entry: ["trained", "evaluated", "preprocessed"],
    mid: ["deployed", "fine-tuned", "experimented"],
    senior: ["designed ML architecture", "productionized", "scaled ML systems"],
  }),

  preferredSections: [
    "summary",
    "skills",
    "experience",
    "projects",
    "education",
    "certifications",
    "publications",
  ],

  projectSignals: [
    "machine learning model",
    "deep learning",
    "NLP",
    "computer vision",
    "prediction",
    "classification",
    "recommendation system",
    "model deployment",
  ],

  achievementSignals: [
    "accuracy improvement",
    "precision improvement",
    "recall improvement",
    "latency reduction",
    "model performance",
    "cost reduction",
  ],

  benchmarkAvailable: true,
};

// ============================================================
// DATA ANALYST
// ============================================================

const DATA_ANALYST: RoleIntelligenceProfile = {
  id: "data-analyst",

  name: "Data Analyst",

  family: "data",

  aliases: [
    "data analyst",
    "business data analyst",
    "reporting analyst",
    "analytics analyst",
    "business analyst data",
  ],

  coreSkills: [
    "SQL",
    "Excel",
    "Data Analysis",
    "Statistics",
    "Data Visualization",
  ],

  supportingSkills: [
    "Python",
    "Pandas",
    "Power BI",
    "Tableau",
    "NumPy",
    "Google Sheets",
  ],

  tools: ["Excel", "Power BI", "Tableau", "Jupyter", "SQL", "Python"],

  concepts: [
    "data cleaning",
    "data transformation",
    "statistical analysis",
    "business intelligence",
    "reporting",
    "dashboarding",
    "data visualization",
    "KPI analysis",
  ],

  responsibilities: [
    "analyze business data",
    "build dashboards",
    "generate reports",
    "identify trends",
    "clean datasets",
    "present insights",
    "support business decisions",
  ],

  keywords: [
    "SQL",
    "Excel",
    "Power BI",
    "Tableau",
    "Python",
    "Pandas",
    "data analysis",
    "data visualization",
    "statistics",
    "dashboard",
    "reporting",
  ],

  senioritySignals: createSenioritySignals({
    entry: ["analyzed", "prepared", "reported"],
    mid: ["automated", "presented", "owned analytics"],
    senior: ["drove insights", "established reporting", "led analytics"],
  }),

  preferredSections: [
    "summary",
    "skills",
    "experience",
    "projects",
    "education",
    "certifications",
  ],

  projectSignals: [
    "dashboard",
    "business intelligence",
    "data analysis",
    "SQL analysis",
    "data visualization",
    "KPI reporting",
  ],

  achievementSignals: [
    "revenue increase",
    "cost reduction",
    "time saved",
    "process improvement",
    "forecast accuracy",
  ],

  benchmarkAvailable: true,
};

// ============================================================
// DEVOPS ENGINEER
// ============================================================

const DEVOPS_ENGINEER: RoleIntelligenceProfile = {
  id: "devops-engineer",

  name: "DevOps Engineer",

  family: "devops",

  aliases: [
    "devops engineer",
    "devops developer",
    "site reliability engineer",
    "platform engineer",
    "sre",
  ],

  coreSkills: ["Linux", "Git", "CI/CD", "Docker", "Cloud"],

  supportingSkills: [
    "Kubernetes",
    "AWS",
    "Azure",
    "Terraform",
    "Jenkins",
    "GitHub Actions",
    "Monitoring",
    "Networking",
    "Bash",
  ],

  tools: [
    "Docker",
    "Kubernetes",
    "Terraform",
    "Jenkins",
    "GitHub Actions",
    "AWS",
    "Azure",
    "Linux",
    "Prometheus",
    "Grafana",
  ],

  concepts: [
    "CI/CD",
    "infrastructure as code",
    "containerization",
    "orchestration",
    "monitoring",
    "logging",
    "cloud infrastructure",
    "networking",
    "security",
    "high availability",
  ],

  responsibilities: [
    "build deployment pipelines",
    "manage cloud infrastructure",
    "automate deployments",
    "monitor applications",
    "manage containers",
    "maintain production systems",
    "improve reliability",
    "automate infrastructure",
  ],

  keywords: [
    "devops",
    "ci/cd",
    "docker",
    "kubernetes",
    "aws",
    "azure",
    "terraform",
    "jenkins",
    "linux",
    "git",
    "monitoring",
    "infrastructure",
  ],

  senioritySignals: createSenioritySignals({
    entry: ["configured", "deployed"],
    mid: ["managed infrastructure", "automated deployments"],
    senior: ["architected infrastructure", "designed platform"],
  }),

  preferredSections: [
    "summary",
    "skills",
    "experience",
    "projects",
    "education",
    "certifications",
  ],

  projectSignals: [
    "CI/CD pipeline",
    "Docker",
    "Kubernetes",
    "cloud deployment",
    "infrastructure",
    "monitoring",
  ],

  achievementSignals: [
    "deployment time reduction",
    "downtime reduction",
    "uptime improvement",
    "infrastructure cost reduction",
    "deployment frequency",
  ],

  benchmarkAvailable: true,
};

// ============================================================
// CLOUD ENGINEER
// ============================================================

const CLOUD_ENGINEER: RoleIntelligenceProfile = {
  id: "cloud-engineer",

  name: "Cloud Engineer",

  family: "cloud",

  aliases: [
    "cloud engineer",
    "cloud developer",
    "cloud architect",
    "aws engineer",
    "azure engineer",
    "gcp engineer",
  ],

  coreSkills: ["Cloud Computing", "AWS", "Azure", "GCP", "Linux"],

  supportingSkills: [
    "Docker",
    "Kubernetes",
    "Terraform",
    "Networking",
    "Security",
    "CI/CD",
    "Infrastructure as Code",
  ],

  tools: [
    "AWS",
    "Azure",
    "GCP",
    "Terraform",
    "Docker",
    "Kubernetes",
    "CloudFormation",
    "Git",
    "Jenkins",
  ],

  concepts: [
    "cloud architecture",
    "networking",
    "infrastructure as code",
    "high availability",
    "scalability",
    "cloud security",
    "monitoring",
    "disaster recovery",
    "load balancing",
  ],

  responsibilities: [
    "design cloud infrastructure",
    "deploy cloud applications",
    "manage cloud resources",
    "automate infrastructure",
    "monitor cloud systems",
    "implement cloud security",
    "optimize cloud costs",
  ],

  keywords: [
    "cloud",
    "AWS",
    "Azure",
    "GCP",
    "Docker",
    "Kubernetes",
    "Terraform",
    "Linux",
    "networking",
    "infrastructure",
    "CI/CD",
  ],

  senioritySignals: createSenioritySignals({
    entry: ["configured cloud resources", "deployed"],
    mid: ["managed cloud infrastructure", "optimized cloud costs"],
    senior: ["architected cloud infrastructure", "designed cloud architecture"],
  }),

  preferredSections: [
    "summary",
    "skills",
    "experience",
    "projects",
    "certifications",
    "education",
  ],

  projectSignals: [
    "cloud migration",
    "cloud deployment",
    "AWS",
    "Azure",
    "GCP",
    "infrastructure as code",
  ],

  achievementSignals: [
    "cloud cost reduction",
    "uptime improvement",
    "deployment improvement",
    "performance improvement",
  ],

  benchmarkAvailable: true,
};

// ============================================================
// QA ENGINEER
// ============================================================

const QA_ENGINEER: RoleIntelligenceProfile = {
  id: "qa-engineer",

  name: "QA Engineer",

  family: "qa",

  aliases: [
    "qa engineer",
    "quality assurance engineer",
    "software tester",
    "test engineer",
    "qa tester",
    "automation tester",
  ],

  coreSkills: [
    "Software Testing",
    "Test Automation",
    "Manual Testing",
    "API Testing",
    "Test Cases",
  ],

  supportingSkills: [
    "Selenium",
    "Cypress",
    "Playwright",
    "Jest",
    "Postman",
    "SQL",
    "Java",
    "JavaScript",
    "Python",
  ],

  tools: [
    "Selenium",
    "Cypress",
    "Playwright",
    "Postman",
    "Jira",
    "Jenkins",
    "Jest",
    "TestRail",
  ],

  concepts: [
    "test planning",
    "regression testing",
    "integration testing",
    "unit testing",
    "API testing",
    "test automation",
    "bug tracking",
    "quality assurance",
    "CI/CD",
  ],

  responsibilities: [
    "design test cases",
    "execute test plans",
    "automate test scenarios",
    "identify defects",
    "perform regression testing",
    "test APIs",
    "report bugs",
    "improve software quality",
  ],

  keywords: [
    "QA",
    "quality assurance",
    "testing",
    "test automation",
    "selenium",
    "cypress",
    "playwright",
    "API testing",
    "manual testing",
    "regression testing",
    "Jira",
  ],

  senioritySignals: createSenioritySignals({
    entry: ["tested", "executed test cases", "reported defects"],
    mid: ["automated", "designed test suites", "owned testing"],
    senior: [
      "architected test automation",
      "led QA strategy",
      "established quality processes",
    ],
  }),

  preferredSections: [
    "summary",
    "skills",
    "experience",
    "projects",
    "certifications",
    "education",
  ],

  projectSignals: [
    "test automation",
    "API testing",
    "end-to-end testing",
    "regression testing",
    "CI/CD",
  ],

  achievementSignals: [
    "test coverage improvement",
    "defect reduction",
    "testing time reduction",
    "automation improvement",
  ],

  benchmarkAvailable: true,
};

// ============================================================
// MOBILE DEVELOPER
// ============================================================

const MOBILE_DEVELOPER: RoleIntelligenceProfile = {
  id: "mobile-developer",

  name: "Mobile Developer",

  family: "mobile",

  aliases: [
    "mobile developer",
    "mobile engineer",
    "android developer",
    "ios developer",
    "flutter developer",
    "react native developer",
  ],

  coreSkills: ["Mobile Development", "Android", "iOS", "Mobile UI"],

  supportingSkills: [
    "Flutter",
    "React Native",
    "Kotlin",
    "Java",
    "Swift",
    "Dart",
    "REST API",
    "Git",
  ],

  tools: [
    "Android Studio",
    "Xcode",
    "Flutter",
    "React Native",
    "Firebase",
    "Git",
    "GitHub",
  ],

  concepts: [
    "mobile architecture",
    "state management",
    "offline storage",
    "API integration",
    "push notifications",
    "mobile security",
    "performance",
    "app lifecycle",
  ],

  responsibilities: [
    "develop mobile applications",
    "build reusable mobile components",
    "integrate APIs",
    "implement mobile UI",
    "optimize application performance",
    "fix mobile bugs",
    "publish applications",
  ],

  keywords: [
    "mobile",
    "android",
    "ios",
    "flutter",
    "react native",
    "kotlin",
    "swift",
    "dart",
    "firebase",
    "REST API",
  ],

  senioritySignals: createSenioritySignals(),

  preferredSections: [
    "summary",
    "skills",
    "experience",
    "projects",
    "education",
  ],

  projectSignals: [
    "mobile application",
    "android app",
    "ios app",
    "flutter app",
    "react native app",
  ],

  achievementSignals: [
    "app performance improvement",
    "crash reduction",
    "user growth",
    "app rating improvement",
  ],

  benchmarkAvailable: true,
};

// ============================================================
// UI / UX DESIGNER
// ============================================================

const UI_UX_DESIGNER: RoleIntelligenceProfile = {
  id: "ui-ux-designer",

  name: "UI/UX Designer",

  family: "ui-ux",

  aliases: [
    "ui ux designer",
    "ui/ux designer",
    "ux designer",
    "ui designer",
    "product designer",
    "user experience designer",
    "user interface designer",
  ],

  coreSkills: [
    "UI Design",
    "UX Design",
    "User Research",
    "Wireframing",
    "Prototyping",
  ],

  supportingSkills: [
    "Figma",
    "Adobe XD",
    "Sketch",
    "Design Systems",
    "Usability Testing",
    "Interaction Design",
    "Visual Design",
  ],

  tools: ["Figma", "Adobe XD", "Sketch", "FigJam", "Miro"],

  concepts: [
    "user experience",
    "user research",
    "information architecture",
    "interaction design",
    "design systems",
    "usability",
    "accessibility",
    "visual hierarchy",
  ],

  responsibilities: [
    "design user interfaces",
    "conduct user research",
    "create wireframes",
    "build prototypes",
    "conduct usability testing",
    "maintain design systems",
    "collaborate with engineers",
  ],

  keywords: [
    "UI",
    "UX",
    "Figma",
    "wireframes",
    "prototypes",
    "user research",
    "usability",
    "design systems",
    "interaction design",
  ],

  senioritySignals: createSenioritySignals({
    entry: ["designed", "prototyped", "created wireframes"],
    mid: ["owned design", "conducted research", "established design systems"],
    senior: [
      "led design strategy",
      "defined design systems",
      "drove user experience",
    ],
  }),

  preferredSections: [
    "summary",
    "skills",
    "experience",
    "projects",
    "education",
    "certifications",
  ],

  projectSignals: [
    "mobile app design",
    "web application design",
    "design system",
    "prototype",
    "user research",
  ],

  achievementSignals: [
    "conversion improvement",
    "usability improvement",
    "user satisfaction",
    "engagement improvement",
  ],

  benchmarkAvailable: true,
};

// ============================================================
// PRODUCT MANAGER
// ============================================================

const PRODUCT_MANAGER: RoleIntelligenceProfile = {
  id: "product-manager",

  name: "Product Manager",

  family: "product",

  aliases: [
    "product manager",
    "product management",
    "associate product manager",
    "apm",
    "senior product manager",
  ],

  coreSkills: [
    "Product Management",
    "Product Strategy",
    "Roadmapping",
    "Stakeholder Management",
    "Requirements",
  ],

  supportingSkills: [
    "Agile",
    "Scrum",
    "User Research",
    "Analytics",
    "SQL",
    "A/B Testing",
    "Product Metrics",
  ],

  tools: [
    "Jira",
    "Confluence",
    "Notion",
    "Amplitude",
    "Mixpanel",
    "Google Analytics",
  ],

  concepts: [
    "product strategy",
    "roadmap",
    "product discovery",
    "user research",
    "prioritization",
    "product metrics",
    "experimentation",
    "stakeholder management",
    "agile",
  ],

  responsibilities: [
    "define product requirements",
    "manage product roadmap",
    "prioritize features",
    "conduct product discovery",
    "analyze product metrics",
    "coordinate stakeholders",
    "work with engineering teams",
    "measure product outcomes",
  ],

  keywords: [
    "product management",
    "product strategy",
    "roadmap",
    "requirements",
    "agile",
    "scrum",
    "user research",
    "analytics",
    "stakeholder management",
    "product metrics",
  ],

  senioritySignals: createSenioritySignals({
    entry: ["supported", "analyzed", "coordinated"],
    mid: ["owned roadmap", "prioritized", "launched"],
    senior: [
      "defined product strategy",
      "drove product vision",
      "led cross-functional teams",
    ],
  }),

  preferredSections: [
    "summary",
    "skills",
    "experience",
    "projects",
    "education",
    "certifications",
  ],

  projectSignals: [
    "product launch",
    "feature launch",
    "product strategy",
    "user research",
    "A/B testing",
  ],

  achievementSignals: [
    "user growth",
    "retention improvement",
    "conversion improvement",
    "revenue growth",
    "engagement improvement",
  ],

  benchmarkAvailable: true,
};

// ============================================================
// DIGITAL MARKETING
// ============================================================

const DIGITAL_MARKETING: RoleIntelligenceProfile = {
  id: "digital-marketing",

  name: "Digital Marketing",

  family: "marketing",

  aliases: [
    "digital marketing",
    "digital marketer",
    "digital marketing executive",
    "marketing specialist",
    "performance marketer",
    "growth marketer",
  ],

  coreSkills: [
    "Digital Marketing",
    "SEO",
    "SEM",
    "Content Marketing",
    "Social Media Marketing",
  ],

  supportingSkills: [
    "Google Ads",
    "Meta Ads",
    "Google Analytics",
    "Email Marketing",
    "Copywriting",
    "Marketing Analytics",
    "Lead Generation",
  ],

  tools: [
    "Google Analytics",
    "Google Ads",
    "Meta Ads Manager",
    "Search Console",
    "HubSpot",
    "Mailchimp",
    "SEMrush",
    "Ahrefs",
  ],

  concepts: [
    "SEO",
    "SEM",
    "conversion optimization",
    "lead generation",
    "marketing funnel",
    "content strategy",
    "campaign optimization",
    "analytics",
  ],

  responsibilities: [
    "plan marketing campaigns",
    "manage digital channels",
    "optimize campaigns",
    "analyze marketing performance",
    "generate leads",
    "improve conversion rates",
    "manage SEO initiatives",
  ],

  keywords: [
    "digital marketing",
    "SEO",
    "SEM",
    "Google Ads",
    "Meta Ads",
    "content marketing",
    "social media",
    "lead generation",
    "Google Analytics",
    "conversion",
  ],

  senioritySignals: createSenioritySignals({
    entry: ["executed campaigns", "created content", "analyzed campaigns"],
    mid: ["optimized campaigns", "managed budgets", "owned channels"],
    senior: [
      "led marketing strategy",
      "drove growth",
      "established acquisition strategy",
    ],
  }),

  preferredSections: [
    "summary",
    "skills",
    "experience",
    "projects",
    "education",
    "certifications",
  ],

  projectSignals: [
    "marketing campaign",
    "SEO campaign",
    "paid advertising",
    "lead generation",
    "content campaign",
  ],

  achievementSignals: [
    "ROAS improvement",
    "conversion improvement",
    "lead growth",
    "traffic growth",
    "cost per acquisition reduction",
  ],

  benchmarkAvailable: true,
};

// ============================================================
// FINANCE
// ============================================================

const FINANCE_ANALYST: RoleIntelligenceProfile = {
  id: "finance-analyst",

  name: "Finance Analyst",

  family: "finance",

  aliases: [
    "finance analyst",
    "financial analyst",
    "financial analyst associate",
    "fp&a analyst",
    "investment analyst",
  ],

  coreSkills: [
    "Financial Analysis",
    "Excel",
    "Financial Modeling",
    "Accounting",
    "Financial Reporting",
  ],

  supportingSkills: [
    "Power BI",
    "SQL",
    "Forecasting",
    "Budgeting",
    "Valuation",
    "Data Analysis",
  ],

  tools: [
    "Microsoft Excel",
    "Power BI",
    "Tableau",
    "SAP",
    "Oracle",
    "Bloomberg",
  ],

  concepts: [
    "financial modeling",
    "forecasting",
    "budgeting",
    "variance analysis",
    "financial reporting",
    "valuation",
    "risk analysis",
    "accounting",
  ],

  responsibilities: [
    "prepare financial analysis",
    "build financial models",
    "analyze financial performance",
    "prepare reports",
    "support budgeting",
    "perform variance analysis",
    "support business decisions",
  ],

  keywords: [
    "financial analysis",
    "Excel",
    "financial modeling",
    "accounting",
    "forecasting",
    "budgeting",
    "valuation",
    "financial reporting",
    "Power BI",
  ],

  senioritySignals: createSenioritySignals({
    entry: ["analyzed", "prepared reports", "supported"],
    mid: ["owned analysis", "built financial models", "managed forecasts"],
    senior: [
      "led financial planning",
      "drove financial strategy",
      "established forecasting",
    ],
  }),

  preferredSections: [
    "summary",
    "skills",
    "experience",
    "education",
    "certifications",
  ],

  projectSignals: [
    "financial model",
    "forecasting",
    "budget analysis",
    "valuation",
    "financial dashboard",
  ],

  achievementSignals: [
    "cost reduction",
    "forecast accuracy",
    "revenue growth",
    "budget optimization",
    "process improvement",
  ],

  benchmarkAvailable: true,
};

// ============================================================
// HR
// ============================================================

const HR_PROFESSIONAL: RoleIntelligenceProfile = {
  id: "hr-professional",

  name: "HR Professional",

  family: "hr",

  aliases: [
    "hr",
    "hr professional",
    "human resources",
    "hr executive",
    "hr manager",
    "talent acquisition",
    "recruiter",
    "technical recruiter",
  ],

  coreSkills: [
    "Human Resources",
    "Recruitment",
    "Talent Acquisition",
    "Employee Relations",
    "HR Operations",
  ],

  supportingSkills: [
    "Onboarding",
    "Performance Management",
    "HR Analytics",
    "Payroll",
    "Compliance",
    "Training",
    "Employer Branding",
  ],

  tools: [
    "Workday",
    "SAP SuccessFactors",
    "LinkedIn Recruiter",
    "Greenhouse",
    "BambooHR",
    "Excel",
  ],

  concepts: [
    "talent acquisition",
    "employee engagement",
    "performance management",
    "onboarding",
    "HR operations",
    "HR analytics",
    "employment compliance",
    "workforce planning",
  ],

  responsibilities: [
    "manage recruitment processes",
    "source candidates",
    "conduct interviews",
    "manage onboarding",
    "support employee relations",
    "maintain HR operations",
    "analyze workforce data",
  ],

  keywords: [
    "HR",
    "human resources",
    "recruitment",
    "talent acquisition",
    "employee relations",
    "onboarding",
    "performance management",
    "HR analytics",
    "LinkedIn Recruiter",
  ],

  senioritySignals: createSenioritySignals({
    entry: ["coordinated", "supported recruitment", "scheduled interviews"],
    mid: ["managed hiring", "owned recruitment", "led onboarding"],
    senior: [
      "led HR strategy",
      "drove workforce planning",
      "established talent strategy",
    ],
  }),

  preferredSections: [
    "summary",
    "skills",
    "experience",
    "education",
    "certifications",
  ],

  projectSignals: [
    "recruitment campaign",
    "employee engagement",
    "HR analytics",
    "employer branding",
    "onboarding program",
  ],

  achievementSignals: [
    "time-to-hire reduction",
    "retention improvement",
    "employee engagement improvement",
    "hiring volume",
    "cost per hire reduction",
  ],

  benchmarkAvailable: true,
};

// ============================================================
// ROLE REGISTRY
// ============================================================

export const ROLE_INTELLIGENCE_PROFILES: RoleIntelligenceProfile[] = [
  FRONTEND_DEVELOPER,
  BACKEND_DEVELOPER,
  FULLSTACK_DEVELOPER,
  JAVA_DEVELOPER,
  PYTHON_DEVELOPER,
  AI_ML_ENGINEER,
  DATA_ANALYST,
  DEVOPS_ENGINEER,
  CLOUD_ENGINEER,
  QA_ENGINEER,
  MOBILE_DEVELOPER,
  UI_UX_DESIGNER,
  PRODUCT_MANAGER,
  DIGITAL_MARKETING,
  FINANCE_ANALYST,
  HR_PROFESSIONAL,
];

// ============================================================
// TEXT NORMALIZATION
// ============================================================

export const normalizeRoleText = (value: string): string => {
  return value
    .toLowerCase()
    .trim()
    .replace(/&/g, " and ")
    .replace(/[./_-]/g, " ")
    .replace(/[^a-z0-9+# ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

// ============================================================
// TOKENIZATION
// ============================================================

const tokenizeRole = (value: string): string[] => {
  return Array.from(
    new Set(normalizeRoleText(value).split(" ").filter(Boolean)),
  );
};

// ============================================================
// TOKEN MATCH SCORE
// ============================================================
//
// Prevents naive substring matching.
//
// Example:
//
// "Full Stack Java Developer"
//
// Full Stack Developer
// → strong overlap
//
// Java Developer
// → weaker overlap
//
// Exact matches receive a large bonus.
// ============================================================

const scoreAliasMatch = (
  roleTokens: string[],
  aliasTokens: string[],
  normalizedRole: string,
  normalizedAlias: string,
): number => {
  if (!roleTokens.length || !aliasTokens.length) {
    return 0;
  }

  // Exact complete match
  if (normalizedRole === normalizedAlias) {
    return 1000;
  }

  const roleSet = new Set(roleTokens);

  const matchedTokens = aliasTokens.filter((token) => roleSet.has(token));

  if (!matchedTokens.length) {
    return 0;
  }

  const overlap = matchedTokens.length / aliasTokens.length;

  const coverage = matchedTokens.length / roleTokens.length;

  // Prefer aliases that explain more of the supplied title.
  let score = overlap * 70 + coverage * 30;

  // Small bonus when the alias appears
  // as a complete token sequence.
  const aliasPosition = roleTokens.join(" ").indexOf(aliasTokens.join(" "));

  if (aliasPosition >= 0) {
    score += 10;
  }

  return score;
};

// ============================================================
// PROFILE MATCH
// ============================================================

interface RoleMatchResult {
  profile: RoleIntelligenceProfile | null;

  score: number;

  matchedAlias: string | null;
}

export const matchRoleProfile = (targetRole: string): RoleMatchResult => {
  const normalizedRole = normalizeRoleText(targetRole);

  const roleTokens = tokenizeRole(targetRole);

  if (!normalizedRole || !roleTokens.length) {
    return {
      profile: null,
      score: 0,
      matchedAlias: null,
    };
  }

  let bestProfile: RoleIntelligenceProfile | null = null;

  let bestScore = 0;

  let bestAlias: string | null = null;

  for (const profile of ROLE_INTELLIGENCE_PROFILES) {
    const aliases = unique([profile.name, ...profile.aliases]);

    for (const alias of aliases) {
      const normalizedAlias = normalizeRoleText(alias);

      const aliasTokens = tokenizeRole(alias);

      const score = scoreAliasMatch(
        roleTokens,
        aliasTokens,
        normalizedRole,
        normalizedAlias,
      );

      if (score > bestScore) {
        bestScore = score;

        bestProfile = profile;

        bestAlias = alias;
      }
    }
  }

  return {
    profile: bestProfile,
    score: bestScore,
    matchedAlias: bestAlias,
  };
};

// ============================================================
// FIND ROLE PROFILE
// ============================================================

export const findRoleProfile = (
  targetRole: string,
): RoleIntelligenceProfile | null => {
  const result = matchRoleProfile(targetRole);

  // Conservative threshold.
  //
  // If there is not enough evidence that the
  // title belongs to a known role, return null.
  if (!result.profile || result.score < 45) {
    return null;
  }

  return result.profile;
};

// ============================================================
// CUSTOM ROLE PROFILE
// ============================================================
//
// IMPORTANT:
// Unknown roles DO NOT receive fake benchmark data.
//
// This prevents:
// matched / 0
// division-by-zero
// accidental 100% role fit
// misleading benchmark claims
// ============================================================

const createCustomRoleProfile = (
  targetRole: string,
): RoleIntelligenceProfile => {
  return {
    id: "custom",

    name: targetRole.trim(),

    family: "general",

    aliases: [],

    coreSkills: [],

    supportingSkills: [],

    tools: [],

    concepts: [],

    responsibilities: [],

    keywords: [],

    senioritySignals: createSenioritySignals(),

    preferredSections: [
      "summary",
      "skills",
      "experience",
      "projects",
      "education",
    ],

    projectSignals: [],

    achievementSignals: [],

    benchmarkAvailable: false,
  };
};

// ============================================================
// ROLE PROFILE RESOLUTION
// ============================================================

export const resolveRoleProfile = (
  targetRole: string,
): RoleIntelligenceProfile => {
  const profile = findRoleProfile(targetRole);

  if (profile) {
    return profile;
  }

  return createCustomRoleProfile(targetRole);
};

// ============================================================
// ROLE MATCH INFORMATION
// ============================================================

export const getRoleMatchInfo = (targetRole: string) => {
  const result = matchRoleProfile(targetRole);

  return {
    targetRole: targetRole.trim(),

    matchedProfile: result.profile?.name ?? null,

    profileId: result.profile?.id ?? "custom",

    family: result.profile?.family ?? "general",

    matchedAlias: result.matchedAlias,

    matchScore: Math.round(result.score),

    benchmarkAvailable: Boolean(result.profile),
  };
};

// ============================================================
// ROLE SKILL POOL
// ============================================================

export const getRoleSkillPool = (targetRole: string): string[] => {
  const profile = resolveRoleProfile(targetRole);

  if (!profile.benchmarkAvailable) {
    return [];
  }

  return unique([
    ...profile.coreSkills,
    ...profile.supportingSkills,
    ...profile.tools,
    ...profile.keywords,
  ]);
};

// ============================================================
// ROLE CORE SKILL POOL
// ============================================================

export const getRoleCoreSkillPool = (targetRole: string): string[] => {
  const profile = resolveRoleProfile(targetRole);

  if (!profile.benchmarkAvailable) {
    return [];
  }

  return unique([...profile.coreSkills]);
};

// ============================================================
// ROLE KEYWORD POOL
// ============================================================

export const getRoleKeywordPool = (targetRole: string): string[] => {
  const profile = resolveRoleProfile(targetRole);

  if (!profile.benchmarkAvailable) {
    return [];
  }

  return unique([
    ...profile.keywords,
    ...profile.coreSkills,
    ...profile.supportingSkills,
    ...profile.concepts,
  ]);
};

// ============================================================
// ROLE RESPONSIBILITY POOL
// ============================================================

export const getRoleResponsibilityPool = (targetRole: string): string[] => {
  const profile = resolveRoleProfile(targetRole);

  if (!profile.benchmarkAvailable) {
    return [];
  }

  return unique([...profile.responsibilities]);
};

// ============================================================
// ROLE PROJECT SIGNALS
// ============================================================

export const getRoleProjectSignals = (targetRole: string): string[] => {
  const profile = resolveRoleProfile(targetRole);

  if (!profile.benchmarkAvailable) {
    return [];
  }

  return unique([...profile.projectSignals]);
};

// ============================================================
// ROLE ACHIEVEMENT SIGNALS
// ============================================================

export const getRoleAchievementSignals = (targetRole: string): string[] => {
  const profile = resolveRoleProfile(targetRole);

  if (!profile.benchmarkAvailable) {
    return [];
  }

  return unique([...profile.achievementSignals]);
};

// ============================================================
// ROLE SECTION SIGNALS
// ============================================================

export const getPreferredRoleSections = (targetRole: string): string[] => {
  const profile = resolveRoleProfile(targetRole);

  return unique([...profile.preferredSections]);
};

// ============================================================
// BENCHMARK STATUS
// ============================================================

export const hasRoleBenchmark = (targetRole: string): boolean => {
  const profile = resolveRoleProfile(targetRole);

  return profile.benchmarkAvailable;
};

// ============================================================
// ROLE FAMILY
// ============================================================

export const getRoleFamily = (targetRole: string): RoleFamily => {
  const profile = resolveRoleProfile(targetRole);

  return profile.family;
};

// ============================================================
// ROLE SENIORITY SIGNALS
// ============================================================

export const getRoleSenioritySignals = (
  targetRole: string,
): RoleSenioritySignals => {
  const profile = resolveRoleProfile(targetRole);

  return profile.senioritySignals;
};
