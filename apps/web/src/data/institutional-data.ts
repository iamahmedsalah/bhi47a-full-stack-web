export interface AcademicProgram {
  id: string;
  slug: string;
  code: string;
  titleAr: string;
  titleEn: string;
  degreeAr: string;
  degreeEn: string;
  descriptionAr: string;
  descriptionEn: string;
  durationAr: string;
  durationEn: string;
  creditHours: number;
  featured: boolean;
  careerProspectsAr: string[];
  careerProspectsEn: string[];
  keyTopicsAr: string[];
  keyTopicsEn: string[];
}

export interface NewsItem {
  id: string;
  slug: string;
  titleAr: string;
  titleEn: string;
  summaryAr: string;
  summaryEn: string;
  contentAr: string[];
  contentEn: string[];
  date: string; // ISO format: YYYY-MM-DD
  category: 'academic' | 'announcements' | 'activities' | 'administrative';
  categoryAr: string;
  categoryEn: string;
  image: string;
  authorAr: string;
  authorEn: string;
  readTime: string;
}

export interface EventItem {
  id: string;
  slug: string;
  titleAr: string;
  titleEn: string;
  descriptionAr: string;
  descriptionEn: string;
  date: string; // YYYY-MM-DD
  timeAr: string;
  timeEn: string;
  locationAr: string;
  locationEn: string;
  category: 'academic' | 'workshop' | 'sports' | 'conference';
  categoryAr: string;
  categoryEn: string;
  isUpcoming: boolean;
}

export interface ActivityItem {
  id: string;
  slug: string;
  titleAr: string;
  titleEn: string;
  descriptionAr: string;
  descriptionEn: string;
  category: 'sports' | 'scientific' | 'cultural' | 'social';
  categoryAr: string;
  categoryEn: string;
  image: string;
  highlightsAr: string[];
  highlightsEn: string[];
}

export interface GalleryItem {
  id: string;
  titleAr: string;
  titleEn: string;
  category: 'campus' | 'labs' | 'activities' | 'library';
  categoryAr: string;
  categoryEn: string;
  image: string;
  descriptionAr: string;
  descriptionEn: string;
}

export interface DownloadDocument {
  id: string;
  titleAr: string;
  titleEn: string;
  category: 'students' | 'academic' | 'schedules' | 'regulations';
  categoryAr: string;
  categoryEn: string;
  format: 'PDF' | 'DOCX' | 'XLSX';
  fileSize: string;
  updatedDate: string;
  downloadUrl: string;
}

export interface QuickLink {
  id: string;
  titleAr: string;
  titleEn: string;
  descriptionAr: string;
  descriptionEn: string;
  href: string;
  icon: string;
  isExternal?: boolean;
}

// ─── Verified Institutional Core Info ──────────────────────────────────────────

export const INSTITUTE_INFO = {
  nameAr: 'المعهد العالي للعلوم الإدارية المتقدمة والحاسبات',
  nameEn: 'High Institute for Advanced Management Sciences and Computer',
  name: {
    ar: 'المعهد العالي للعلوم الإدارية المتقدمة والحاسبات',
    en: 'High Institute for Advanced Management Sciences and Computer',
  },
  shortName: 'BHI47',
  code: '47',
  coordinationCode: '47/أ',
  establishedYear: '2006',
  ministryAffiliationAr: 'وزارة التعليم العالي والبحث العلمي - جمهورية مصر العربية',
  ministryAffiliationEn: 'Ministry of Higher Education and Scientific Research - Arab Republic of Egypt',
  addressAr: 'الكيلو 47، طريق الإسكندرية - القاهرة الصحراوي، محافظة البحيرة',
  addressEn: 'Km 47, Alexandria - Cairo Desert Road, Beheira Governorate, Egypt',
  address: {
    ar: 'الكيلو 47، طريق الإسكندرية - القاهرة الصحراوي، محافظة البحيرة',
    en: 'Km 47, Alexandria - Cairo Desert Road, Beheira Governorate, Egypt',
  },
  phone: '01227034264',
  phoneAlt: '01207010161',
  phones: ['01227034264', '01207010161'],
  email: 'info@bhi47.com',
  academicEmail: 'academic@bhi47.com',
  supportEmail: 'support@bhi47.com',
  workingHoursAr: 'السبت إلى الخميس: 8:30 صباحاً - 3:30 مساءً (الجمعة عطلة رسمية)',
  workingHoursEn: 'Saturday to Thursday: 8:30 AM - 3:30 PM (Friday closed)',
  workingHours: {
    ar: 'السبت إلى الخميس: 8:30 صباحاً - 3:30 مساءً (الجمعة عطلة رسمية)',
    en: 'Saturday to Thursday: 8:30 AM - 3:30 PM (Friday closed)',
  },
  systemAr: 'نظام الساعات المعتمدة (Credit Hours System)',
  systemEn: 'Credit Hours System',
  deanAr: 'عمادة المعهد وأعضاء هيئة التدريس',
  deanEn: 'Institute Deanship & Academic Faculty',
  vision: {
    ar: 'أن يكون المعهد العالي للعلوم الإدارية المتقدمة والحاسبات صرحاً أكاديمياً رائداً ومعتمداً وطنياً وإقليمياً في التعليم الجامعي والبحث التطبيقي وخدمة المجتمع في مجالات نظم المعلومات والعلوم الإدارية والمحاسبية.',
    en: 'To be a premier, nationally accredited higher education institution recognized for academic excellence, applied research, and community engagement in business information systems, accounting, and management sciences.',
  },
  mission: {
    ar: 'يلتزم المعهد بتقديم برامج أكاديمية متميزة مواكبة للمعايير الأكاديمية والمهنية بنظام الساعات المعتمدة، وتوفير بيئة تعليمية محفزة على الابتكار، لإعداد خريجين مؤهلين معرفياً ومهارياً للمنافسة في سوق العمل المحلي والإقليمي.',
    en: 'Committed to delivering high-quality academic programs aligned with national quality assurance standards under the credit-hour framework, fostering innovation and preparing graduates equipped with state-of-the-art skills.',
  },
  objectives: [
    {
      ar: 'تقديم تعليم جامعي متطور يجمع بين المعرفة النظرية والتدريب التقني والتطبيقي الميداني.',
      en: 'Deliver cutting-edge education balancing theoretical knowledge and hands-on applied training.',
    },
    {
      ar: 'تأهيل الطلاب للحصول على شهادات مهنية دولية متخصصة في نظم المعلومات والتحليل المالي.',
      en: 'Qualify students for professional certifications in IT and financial analytics.',
    },
    {
      ar: 'تطوير البنية التحتية التكنولوجية وتوسيع نطاق الخدمات الطلابية الإلكترونية الذكية.',
      en: 'Expand digital campus infrastructure and smart electronic student portals.',
    },
    {
      ar: 'بناء شراكات مستدامة مع قطاعات الأعمال والمؤسسات المصرفية والشركات التقنية.',
      en: 'Foster sustainable partnerships with industry leaders, banking sectors, and tech firms.',
    },
  ],
};

// ─── Academic Programs ────────────────────────────────────────────────────────

export const ACADEMIC_PROGRAMS: AcademicProgram[] = [
  {
    id: 'bis',
    slug: 'business-information-systems',
    code: 'BIS',
    titleAr: 'شعبة نظم معلومات الأعمال (BIS)',
    titleEn: 'Business Information Systems (BIS)',
    degreeAr: 'درجة البكالوريوس في نظم معلومات الأعمال',
    degreeEn: "Bachelor's Degree in Business Information Systems",
    descriptionAr:
      'برنامج أكاديمي متميز يدمج بين علوم الحاسب وتكنولوجيا المعلومات الحديثة وإدارة الأعمال، لتأهيل كوادر متخصصة في تحليل وتصميم النظم البرمجية وقواعد البيانات وإدارة التحول الرقمي بالمؤسسات.',
    descriptionEn:
      'A leading academic program merging modern computer science and information technology with business administration, qualifying specialists in systems design, databases, software engineering, and digital transformation.',
    durationAr: '4 سنوات دراسية (8 فصول دراسية)',
    durationEn: '4 Academic Years (8 Semesters)',
    creditHours: 136,
    featured: true,
    careerProspectsAr: [
      'مطور نظم وبرمجيات أعمال (Software Engineer)',
      'محلل نظم معلومات ومصمم حلول رقمية (Systems Analyst)',
      'مسؤول إدارة قواعد البيانات (Database Administrator)',
      'محلل بيانات وأعمال (Business Intelligence Analyst)',
      'مدير مشروعات تكنولوجيا المعلومات (IT Project Manager)',
    ],
    careerProspectsEn: [
      'Software & Business Solutions Engineer',
      'Information Systems Analyst',
      'Database Administrator (DBA)',
      'Business Intelligence Analyst',
      'IT Project Manager',
    ],
    keyTopicsAr: [
      'برمجة الحاسب وهياكل البيانات',
      'نظم إدارة قواعد البيانات العلائقية',
      'تحليل وتصميم النظم البرمجية',
      'تطبيقات الويب والتجارة الإلكترونية',
      'أمن وسرية المعلومات والشبكات',
    ],
    keyTopicsEn: [
      'Computer Programming & Data Structures',
      'Relational Database Management Systems',
      'Software Systems Analysis & Design',
      'Web Technologies & E-Commerce',
      'Information Security & Computer Networks',
    ],
  },
  {
    id: 'accounting',
    slug: 'accounting-and-auditing',
    code: 'ACCOUNTING',
    titleAr: 'شعبة المحاسبة والمراجعة',
    titleEn: 'Accounting & Auditing Division',
    degreeAr: 'درجة البكالوريوس في المحاسبة',
    degreeEn: "Bachelor's Degree in Accounting",
    descriptionAr:
      'برنامج متكامل يركز على إتقان المعايير المحاسبية والرقابة المالية والمراجعة الحديثة، مع التدريب على الأنظمة المحاسبية الإلكترونية وبرمجيات ERP لتأهيل خريجين على أعلى مستوى من الكفاءة المهنية.',
    descriptionEn:
      'A comprehensive program focusing on accounting standards, modern auditing, and financial management, combined with hands-on enterprise electronic accounting and ERP systems.',
    durationAr: '4 سنوات دراسية (8 فصول دراسية)',
    durationEn: '4 Academic Years (8 Semesters)',
    creditHours: 132,
    featured: true,
    careerProspectsAr: [
      'محاسب مالي معتمد بالمؤسسات والشركات',
      'مراجع ومراقب حسابات قانوني',
      'محاسب تكاليف وإدارة مالية',
      'مستشار ضرائب ومعاملات مالية',
      'محلل مالي واستثماري بالبنوك',
    ],
    careerProspectsEn: [
      'Corporate Financial Accountant',
      'Internal & Statutory Auditor',
      'Cost & Management Accountant',
      'Tax & Financial Consultant',
      'Bank Financial Analyst',
    ],
    keyTopicsAr: [
      'المحاسبة المالية المتقدمة',
      'محاسبة التكاليف والمحاسبة الإدارية',
      'أصول المراجعة والتدقيق المالي',
      'نظم المعلومات المحاسبية المحوسبة',
      'الضرائب والمحاسبة الضريبية في مصر',
    ],
    keyTopicsEn: [
      'Advanced Financial Accounting',
      'Cost & Managerial Accounting',
      'Auditing Principles & Assurance',
      'Computerized Accounting Information Systems',
      'Tax Accounting & Regulations',
    ],
  },
];

// ─── News & Official Announcements ────────────────────────────────────────────

export const NEWS_ITEMS: NewsItem[] = [
  {
    id: 'n1',
    slug: 'fall-semester-registration-schedule-2026',
    titleAr: 'إعلان جدول تسجيل المقررات الدراسية للفصل الدراسي الأول',
    titleEn: 'Course Registration Schedule Announced for Fall Semester',
    summaryAr:
      'تعلن إدارة المعهد عن بدء مواعيد التسجيل الأكاديمي لمقررات الفصل الدراسي لجميع المستويات عبر البوابة الإلكترونية وفقاً لتعليمات الإرشاد الأكاديمي.',
    summaryEn:
      'The Institute Administration announces course registration dates for all academic levels via the Electronic Portal under Academic Advising guidelines.',
    contentAr: [
      'تعلن عمادة المعهد العالي للعلوم الإدارية المتقدمة والحاسبات عن فتح باب تسجيل المقررات للفصل الدراسي الأول للعام الجامعي 2026-2027.',
      'يرجى من جميع الطلاب الدخول إلى البوابة الإلكترونية ومراجعة المرشد الأكاديمي المخصص لاعتماد خطة المقررات والساعات المعتمدة في المواعيد المقررة.',
      'يتم الالتزام بالحد الأدنى والأقصى للعبء الدراسي طبقاً للائحة الساعات المعتمدة والمعدل التراكمي (GPA) لكل طالب.',
    ],
    contentEn: [
      'The Deanship of the High Institute for Advanced Management Sciences and Computer announces the opening of course registration for the Fall Semester 2026-2027.',
      'All students are requested to log in to the Electronic Portal and consult their assigned academic advisor to approve their course load and credit hours.',
      'Students must adhere to the minimum and maximum credit hours according to academic standing and cumulative GPA regulations.',
    ],
    date: '2026-09-28',
    category: 'academic',
    categoryAr: 'شؤون أكاديمية',
    categoryEn: 'Academic Affairs',
    image: '/images/institutional/campus-hero.jpg',
    authorAr: 'إدارة شؤون الطلاب والتعليم',
    authorEn: 'Student & Academic Affairs',
    readTime: '3 دقائق',
  },
  {
    id: 'n2',
    slug: 'advanced-computing-labs-upgrade-2026',
    titleAr: 'تحديث وتطوير معامل الحاسب الآلي بأحدث التجهيزات والبرمجيات',
    titleEn: 'Computer Laboratories Upgraded with State-of-the-Art Systems',
    summaryAr:
      'تم الانتهاء من ترقية وتحديث معامل الحاسب ونظم المعلومات لدعم التدريب العملي لطلاب شعبة BIS في مجالات هندسة البرمجيات وقواعد البيانات.',
    summaryEn:
      'The upgrade of computer and information systems laboratories has been completed to support practical training for BIS students in software engineering and databases.',
    contentAr: [
      'في إطار خطة التطوير المستمر للبيئة التعليمية، دشنت إدارة المعهد التحديث الشامل لمعامل الحاسب الآلي وشبكات المعلومات.',
      'شمل التحديث تزويد المعامل بأجهزة حاسب حديثة فائقة السرعة، وشاشات عرض تفاعلية، مع ربطها بشبكة ألياف ضوئية لخدمة المقررات العملية في البرمجة والذكاء الاصطناعي ونظم المعلومات.',
    ],
    contentEn: [
      'As part of the continuous enhancement of the academic environment, the Institute inaugurated an extensive upgrade of computer labs and networks.',
      'The upgrade features modern high-speed workstations, interactive display panels, and high-bandwidth fiber connectivity supporting programming, AI, and information systems curricula.',
    ],
    date: '2026-09-20',
    category: 'announcements',
    categoryAr: 'تطوير وتجهيزات',
    categoryEn: 'Development & Facilities',
    image: '/images/institutional/computer-lab.jpg',
    authorAr: 'قسم تكنولوجيا المعلومات',
    authorEn: 'IT Department',
    readTime: '2 دقيقة',
  },
  {
    id: 'n3',
    slug: 'academic-library-extended-hours-and-digital-resources',
    titleAr: 'توسعة المكتبة الأكاديمية وإتاحة المراجع الرقمية وقواعد البيانات',
    titleEn: 'Academic Library Expands Digital Resources & Study Space',
    summaryAr:
      'إتاحة مصادر التعلم الإلكترونية والكتب المرجعية في مجالات المحاسبة وعلوم الإدارة ونظم المعلومات لجميع الطلاب وأعضاء هيئة التدريس.',
    summaryEn:
      'Electronic learning resources, reference textbooks, and databases in Accounting, Management, and BIS are now accessible for all students and faculty.',
    contentAr: [
      'تعلن إدارة المكتبة بالمعهد عن تمديد ساعات العمل وفتح صالات القراءة والاطلاع الذاتي للطلاب طوال أيام الأسبوع الدراسي.',
      'كما تم تفعيل الوصول إلى قواعد البيانات والمجلات العلمية المتخصصة في مجالات العلوم التجارية وعلوم الحاسب لخدمة مشروعات التخرج والبحث العلمي.',
    ],
    contentEn: [
      'The Institute Library announces extended operating hours and open study spaces for students throughout the academic week.',
      'Access to specialized academic databases and business/computing journals has also been activated to support graduation projects and student research.',
    ],
    date: '2026-09-12',
    category: 'academic',
    categoryAr: 'خدمات تعليمية',
    categoryEn: 'Learning Resources',
    image: '/images/institutional/library.jpg',
    authorAr: 'إدارة المكتبة والتوثيق',
    authorEn: 'Library Administration',
    readTime: '2 دقيقة',
  },
];

// ─── Academic Events ──────────────────────────────────────────────────────────

export const EVENTS: EventItem[] = [
  {
    id: 'e1',
    slug: 'new-students-orientation-day-2026',
    titleAr: 'اليوم التعريفي للطلاب الجدد للعام الجامعي 2026-2027',
    titleEn: 'New Students Orientation Day 2026-2027',
    descriptionAr:
      'لقاء ترحيبي مع عميد المعهد ورؤساء الأقسام للتعريف باللوائح ونظام الساعات المعتمدة وخدمات البوابة الإلكترونية والأنشطة الطلابية.',
    descriptionEn:
      'A welcoming gathering with the Dean and department heads introducing institute regulations, the credit hours system, portal services, and student activities.',
    date: '2026-10-15',
    timeAr: '10:00 صباحاً - 1:00 ظهراً',
    timeEn: '10:00 AM - 1:00 PM',
    locationAr: 'المدرج المركزي - مبنى المعهد الرئيسي',
    locationEn: 'Central Auditorium - Main Institute Building',
    category: 'academic',
    categoryAr: 'فعالية أكاديمية',
    categoryEn: 'Academic Event',
    isUpcoming: true,
  },
  {
    id: 'e2',
    slug: 'bis-graduation-projects-tech-exhibition-2026',
    titleAr: 'ملتقى مشاريع تخرج شعبة نظم معلومات الأعمال وتكنولوجيا المستقبل',
    titleEn: 'BIS Graduation Projects & Emerging Technology Showcase',
    descriptionAr:
      'معرض سنوي يستعرض فيه طلاب السنة النهائية مشاريعهم البرمجية والتطبيقية في مجالات التجارة الإلكترونية، تحليل البيانات، والنظم المؤسسية الذكية.',
    descriptionEn:
      'Annual showcase where senior students present software and applied solutions in e-commerce, data analysis, and enterprise information systems.',
    date: '2026-11-05',
    timeAr: '11:00 صباحاً - 3:00 مساءً',
    timeEn: '11:00 AM - 3:00 PM',
    locationAr: 'قاعة المؤتمرات والمعارض - الدور الأرضي',
    locationEn: 'Exhibition Hall - Ground Floor',
    category: 'conference',
    categoryAr: 'ملتقى ومعرض',
    categoryEn: 'Conference & Expo',
    isUpcoming: true,
  },
  {
    id: 'e3',
    slug: 'erp-accounting-systems-workshop',
    titleAr: 'ورشة عمل: النظم المحاسبية الإلكترونية وإدارة موارد المؤسسات (ERP)',
    titleEn: 'Workshop: Computerized Accounting & ERP Systems',
    descriptionAr:
      'ورشة تطبيقية مكثفة لطلاب شعبة المحاسبة للتدريب على القيود المحاسبية الإلكترونية وإعداد القوائم المالية باستخدام أحدث برمجيات الأعمال.',
    descriptionEn:
      'Hands-on workshop for accounting students on electronic entries, general ledger systems, and automated financial statements using modern ERP software.',
    date: '2026-11-20',
    timeAr: '12:00 ظهراً - 2:30 مساءً',
    timeEn: '12:00 PM - 2:30 PM',
    locationAr: 'معمل المحاسبة الإلكترونية (معمل 3)',
    locationEn: 'Electronic Accounting Lab (Lab 3)',
    category: 'workshop',
    categoryAr: 'ورشة عمل',
    categoryEn: 'Practical Workshop',
    isUpcoming: true,
  },
];

// ─── Student Activities ───────────────────────────────────────────────────────

export const ACTIVITIES: ActivityItem[] = [
  {
    id: 'act1',
    slug: 'scientific-and-tech-club',
    titleAr: 'النادي العلمي والتكنولوجي',
    titleEn: 'Scientific & Technology Club',
    descriptionAr:
      'منصة تفاعلية لطلاب شعبة BIS وشغوفي البرمجة لتبادل الخبرات وتطوير التطبيقات والمشاركة في مسابقات البرمجة المحلية والجامعية.',
    descriptionEn:
      'An interactive hub for BIS students and coding enthusiasts to collaborate on software projects and participate in inter-university programming contests.',
    category: 'scientific',
    categoryAr: 'نشاط علمي وتكنولوجي',
    categoryEn: 'Scientific & Tech',
    image: '/images/institutional/computer-lab.jpg',
    highlightsAr: [
      'مسابقات هاكاثون وحل المشكلات البرمجية',
      'ورش عمل في تطوير تطبيقات الويب والذكاء الاصطناعي',
      'مجموعات دراسة ذاتية وتبادل المعرفة التقنية',
    ],
    highlightsEn: [
      'Hackathons & competitive coding contests',
      'Web development & applied AI workshops',
      'Peer-to-peer technical mentoring sessions',
    ],
  },
  {
    id: 'act2',
    slug: 'sports-tournaments-and-athletics',
    titleAr: 'النشاط الرياضي والبطولات الطلابية',
    titleEn: 'Sports & Athletic Tournaments',
    descriptionAr:
      'دوريات رياضية موسمية في كرة القدم، تنس الطاولة، والشطرنج لتعزيز الروح الرياضية واللياقة البدنية والترابط بين طلاب المعهد.',
    descriptionEn:
      'Seasonal tournaments in football, table tennis, and chess promoting athletic fitness, sportsmanship, and student camaraderie.',
    category: 'sports',
    categoryAr: 'نشاط رياضي',
    categoryEn: 'Athletics & Sports',
    image: '/images/institutional/campus-hero.jpg',
    highlightsAr: [
      'دوري كرة القدم السنوي لكأس عميد المعهد',
      'بطولات الشطرنج وتنس الطاولة الفردية والزوجية',
      'يوم اللياقة البدنية والماراثون الطلابي بالحرم الجامعي',
    ],
    highlightsEn: [
      'Annual Football Tournament for the Deanship Cup',
      'Singles and doubles table tennis & chess championships',
      'Campus fitness days and athletic runs',
    ],
  },
  {
    id: 'act3',
    slug: 'cultural-and-social-engagement',
    titleAr: 'النشاط الثقافي والمجتمعي',
    titleEn: 'Cultural & Social Engagement',
    descriptionAr:
      'تنظيم الندوات التثقيفية، مسابقات المناظرات، والمعارض الفنية والرحلات العلمية والميدانية لزيارة كبرى الشركات والمؤسسات المالية.',
    descriptionEn:
      'Cultural lectures, debate contests, art showcases, and educational field visits to major financial institutions and technology firms.',
    category: 'cultural',
    categoryAr: 'نشاط ثقافي ومجتمعي',
    categoryEn: 'Cultural & Social',
    image: '/images/institutional/library.jpg',
    highlightsAr: [
      'زيارات ميدانية للبنوك والشركات التكنولوجية الكبرى',
      'مسابقات الإلقاء والمناظرات الطلابية السنوية',
      'مبادرات المشاركة المجتمعية والعمل التطوعي الخيري',
    ],
    highlightsEn: [
      'Field trips to banks and tech enterprises',
      'Public speaking and academic debate competitions',
      'Community service and voluntary initiatives',
    ],
  },
  {
    id: 'act4',
    slug: 'bis-innovation-and-robotics',
    titleAr: 'ملتقى الابتكار والتحول الرقمي',
    titleEn: 'BIS Innovation & Digital Transformation Hub',
    descriptionAr:
      'معامل متقدمة لعرض مشروعات نظم المعلومات، وتطبيقات إنترنت الأشياء، وحلول تحليل البيانات المالية والتجارية الذكية.',
    descriptionEn:
      'Advanced lab spaces showcasing business information systems, IoT applications, and intelligent business analytics solutions.',
    category: 'scientific',
    categoryAr: 'ابتكار رقمي',
    categoryEn: 'Digital Innovation',
    image: '/images/institutional/academics-lab.jpg',
    highlightsAr: [
      'حاضنة مشروعات التخرج والشركات الناشئة',
      'تطبيقات عملية في تحليل البيانات ونمذجة الأعمال',
      'جلسات محاكاة لنظم ERP المحاسبية والإدارية',
    ],
    highlightsEn: [
      'Graduation projects and startup incubation',
      'Applied business data analytics & modeling',
      'ERP system enterprise simulations',
    ],
  },
  {
    id: 'act5',
    slug: 'student-union-and-campus-community',
    titleAr: 'اتحاد الطلاب والريادة الجامعية',
    titleEn: 'Student Union & Campus Leadership',
    descriptionAr:
      'تمثيل الطلاب وقيادة المبادرات التنموية، وتنظيم حفلات استقبال الطلاب الجدد وتكريم أوائل الخريجين والمتفوقين.',
    descriptionEn:
      'Elected student leadership orchestrating campus events, welcoming orientations, and honors ceremonies for top academic achievers.',
    category: 'social',
    categoryAr: 'ريادة طلابية',
    categoryEn: 'Student Leadership',
    image: '/images/institutional/campus-facade.jpg',
    highlightsAr: [
      'حفلات استقبال الطلاب الجدد وتكريم المتفوقين',
      'لجان الأنشطة الاجتماعية والفنية والجوالة',
      'قنوات تواصل مباشرة مع عمادة وإدارة المعهد',
    ],
    highlightsEn: [
      'New student orientation and honors ceremonies',
      'Artistic, social, and scouting committees',
      'Direct liaison with the Institute deanship',
    ],
  },
];

// ─── Photo Gallery ───────────────────────────────────────────────────────────

export const GALLERY_ITEMS: GalleryItem[] = [
  {
    id: 'g1',
    titleAr: 'الحرم الأكاديمي والمباني الإدارية',
    titleEn: 'Campus Grounds & Academic Facade',
    category: 'campus',
    categoryAr: 'الحرم الجامعي',
    categoryEn: 'Campus',
    image: '/images/institutional/campus-hero.jpg',
    descriptionAr: 'واجهة المبنى الأكاديمي الرئيسي والمسطحات الخضراء وممرات الطلاب.',
    descriptionEn: 'Main academic facade, landscaped campus lawns, and pedestrian walkways.',
  },
  {
    id: 'g2',
    titleAr: 'معامل الحاسب الآلي ونظم المعلومات',
    titleEn: 'Computer & Information Systems Labs',
    category: 'labs',
    categoryAr: 'المعامل',
    categoryEn: 'Laboratories',
    image: '/images/institutional/computer-lab.jpg',
    descriptionAr: 'قاعات التدريب العملي المجهزة بأحدث أجهزة الحاسب وشبكات الاتصال فائقة السرعة.',
    descriptionEn: 'Hands-on practical training halls equipped with modern computing infrastructure.',
  },
  {
    id: 'g3',
    titleAr: 'المكتبة المركزية وصالات القراءة والبحث',
    titleEn: 'Central Library & Study Halls',
    category: 'library',
    categoryAr: 'المكتبة',
    categoryEn: 'Library',
    image: '/images/institutional/library.jpg',
    descriptionAr: 'مساحات دراسية هادئة وقاعات مجهزة للمطالعة والبحث الذاتي للطلاب والمراجع العلمية.',
    descriptionEn: 'Quiet study spaces and reference halls designated for student independent research.',
  },
  {
    id: 'g4',
    titleAr: 'معامل الابتكار البرمجي والذكاء الاصطناعي',
    titleEn: 'Software Engineering & Innovation Labs',
    category: 'labs',
    categoryAr: 'المعامل التقنية',
    categoryEn: 'Tech Labs',
    image: '/images/institutional/academics-lab.jpg',
    descriptionAr: 'معامل متخصصة لتطوير برمجيات الأعمال وقواعد البيانات ومشروعات التخرج المتقدمة.',
    descriptionEn: 'Specialized laboratories for business software development and graduation projects.',
  },
  {
    id: 'g5',
    titleAr: 'المدخل الرئيسي والمرافق الطلابية',
    titleEn: 'Main Entrance & Campus Facilities',
    category: 'campus',
    categoryAr: 'المرافق والخدمات',
    categoryEn: 'Campus Facilities',
    image: '/images/institutional/campus-facade.jpg',
    descriptionAr: 'المظهر المعماري للمعهد وساحات الأنشطة الطلابية والخدمات المركزية.',
    descriptionEn: 'Architectural exterior, student activity courtyards, and central student services.',
  },
];

// ─── Downloadable Forms & Documents ───────────────────────────────────────────

export const DOWNLOAD_DOCUMENTS: DownloadDocument[] = [
  {
    id: 'd1',
    titleAr: 'دليل الطالب ونظام الساعات المعتمدة (Academic Student Guide)',
    titleEn: 'Student Handbook & Credit Hours System Guide',
    category: 'academic',
    categoryAr: 'لوائح ودليل الطالب',
    categoryEn: 'Academic Guide',
    format: 'PDF',
    fileSize: '1.8 MB',
    updatedDate: '2026-09-01',
    downloadUrl: '/downloads/student-handbook-2026.pdf',
  },
  {
    id: 'd2',
    titleAr: 'نموذج طلب تسجيل مقررات دراسية (إرشاد أكاديمي)',
    titleEn: 'Course Registration & Advising Form',
    category: 'students',
    categoryAr: 'نماذج الطلاب',
    categoryEn: 'Student Forms',
    format: 'PDF',
    fileSize: '320 KB',
    updatedDate: '2026-09-15',
    downloadUrl: '/downloads/course-registration-form.pdf',
  },
  {
    id: 'd3',
    titleAr: 'الخطة الزمنية والتقويم الأكاديمي للعام الجامعي 2026-2027',
    titleEn: 'Academic Calendar 2026-2027',
    category: 'schedules',
    categoryAr: 'الجداول والتقويم',
    categoryEn: 'Calendar & Schedules',
    format: 'PDF',
    fileSize: '450 KB',
    updatedDate: '2026-09-10',
    downloadUrl: '/downloads/academic-calendar-2026-2027.pdf',
  },
  {
    id: 'd4',
    titleAr: 'نموذج طلب شهادة إثبات قيد أو بيان درجات',
    titleEn: 'Enrollment Verification & Transcript Request Form',
    category: 'students',
    categoryAr: 'نماذج الطلاب',
    categoryEn: 'Student Forms',
    format: 'PDF',
    fileSize: '280 KB',
    updatedDate: '2026-08-20',
    downloadUrl: '/downloads/transcript-request-form.pdf',
  },
  {
    id: 'd5',
    titleAr: 'لائحة الانضباط الجامعي وقواعد السلوك الطلابي',
    titleEn: 'Student Code of Conduct & Institutional Regulations',
    category: 'regulations',
    categoryAr: 'اللوائح والأنظمة',
    categoryEn: 'Regulations',
    format: 'PDF',
    fileSize: '950 KB',
    updatedDate: '2026-08-15',
    downloadUrl: '/downloads/student-conduct-regulations.pdf',
  },
];

// ─── Quick Access Links (Homepage) ───────────────────────────────────────────

export const QUICK_ACCESS_LINKS: QuickLink[] = [
  {
    id: 'portal',
    titleAr: 'البوابة الإلكترونية',
    titleEn: 'Electronic Portal',
    descriptionAr: 'بوابة الطالب، نتائج الامتحانات، والخدمات الإدارية المتكاملة',
    descriptionEn: 'Student portal, academic records, and integrated administrative services',
    href: '/login',
    icon: 'GraduationCap',
  },
  {
    id: 'academics',
    titleAr: 'البرامج الأكاديمية',
    titleEn: 'Academic Programs',
    descriptionAr: 'شعبتي نظم معلومات الأعمال (BIS) والمحاسبة والمراجعة',
    descriptionEn: 'BIS and Accounting & Auditing accredited curricula',
    href: '/academics',
    icon: 'BookOpen',
  },
  {
    id: 'announcements',
    titleAr: 'أحدث الإعلانات',
    titleEn: 'Announcements',
    descriptionAr: 'الجداول الدراسية، مواعيد التسجيل، وأهم التنبيهات الرسمية',
    descriptionEn: 'Timetables, registration deadlines, and official announcements',
    href: '/news',
    icon: 'Bell',
  },
  {
    id: 'complaints',
    titleAr: 'الشكاوى والأعطال',
    titleEn: 'Complaints & Support',
    descriptionAr: 'تقديم ومتابعة التذاكر والدعم الفني المباشر للطلاب',
    descriptionEn: 'Submit and track academic inquiries and technical support tickets',
    href: '/complaints',
    icon: 'MessageSquare',
  },
  {
    id: 'downloads',
    titleAr: 'النماذج والتحميلات',
    titleEn: 'Downloads & Forms',
    descriptionAr: 'دليل الطالب، التقويم الأكاديمي، ونماذج الطلبات والشهادات',
    descriptionEn: 'Student handbook, academic calendar, and application forms',
    href: '/downloads',
    icon: 'Download',
  },
  {
    id: 'contact',
    titleAr: 'تواصل معنا',
    titleEn: 'Contact Us',
    descriptionAr: 'أرقام الهواتف، البريد الرسمي، وساعات العمل واستقبال الطلاب',
    descriptionEn: 'Phone lines, official email, working hours, and campus directions',
    href: '/contact',
    icon: 'MapPin',
  },
];
