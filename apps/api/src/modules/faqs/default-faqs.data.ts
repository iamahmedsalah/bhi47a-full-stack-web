export interface DefaultFaqSeedItem {
  question: string;
  answer: string;
  topics: string[];
  keywords: string[];
  isActive: boolean;
  sortOrder: number;
}

export const DEFAULT_FAQ_ITEMS: DefaultFaqSeedItem[] = [
  // ===== Arabic FAQs (1 - 12) =====
  {
    question: 'كيف أطلع على جدول الامتحانات المعتمد؟',
    answer:
      'يمكنك عرض وتحميل جدول الامتحانات الرسمي من القائمة الجانبية عبر صفحة «جدول الامتحانات»، أو مباشرة من كارت «جدول الامتحانات المعتمد» في الصفحة الرئيسية لبوابة الطالب فور نشره واعتماده من شؤون الطلاب.',
    topics: ['الامتحانات'],
    keywords: [
      'جدول الامتحانات',
      'مواعيد الامتحانات',
      'امتحان الميدترم',
      'امتحان الفاينل',
      'ميعاد الامتحان',
      'الامتحانات',
    ],
    isActive: true,
    sortOrder: 1,
  },
  {
    question: 'كيف أعرف مكان ورقم لجنة الامتحان ورقم الجلوس؟',
    answer:
      'افتح صفحة «مكان الامتحان» من القائمة الجانبية، أو راجع كارت «مكان ورقم لجنة الامتحان» في الصفحة الرئيسية. ستجد رقم الجلوس، المبنى، الدور، ورقم القاعة فور توزيع اللجان رسمياً.',
    topics: ['الامتحانات'],
    keywords: [
      'مكان الامتحان',
      'رقم اللجنة',
      'اللجنة',
      'مقر اللجنة',
      'رقم الجلوس',
      'القاعة',
      'الدور',
      'المبنى',
    ],
    isActive: true,
    sortOrder: 2,
  },
  {
    question: 'ما هي ضوابط دخول اللجنة وماذا أفعل عند وجود عذر قهري للغياب عن الامتحان؟',
    answer:
      'يجب الحضور قبل موعد الامتحان بوقت كافٍ مع إحضار كارنيه المعهد أو بطاقة الرقم القومي. في حال وجود عذر مرضي أو قهري موثق، يجب تقديم الطلب والمستندات الرسمية لشؤون الطلاب خلال المدة المقررة طبقاً للائحة المعهد، ويمكنك الاستفسار المبدئي عبر صفحة «المساعدة والشكاوى».',
    topics: ['الامتحانات'],
    keywords: [
      'غياب امتحان',
      'عذر مرضي',
      'دخول اللجنة',
      'كارنيه',
      'تأجيل امتحان',
      'عذر قهري',
    ],
    isActive: true,
    sortOrder: 3,
  },
  {
    question: 'أين أجد نتائج الميدترم والفاينل ودرجات الكويزات؟',
    answer:
      'لمتابعة نتائج الميدترم والفاينل والمجموع الكلي، افتح صفحة «النتائج» من القائمة الجانبية. أما درجات الكويزات العملية والشهرية فتظهر في صفحة «درجات الكويزات» فور إعلانها من أستاذ المقرر.',
    topics: ['النتائج'],
    keywords: [
      'النتيجة',
      'فين نتيجتي',
      'الدرجات',
      'كشف درجات',
      'الميدترم',
      'الفاينل',
      'درجات الكويزات',
      'كويز',
    ],
    isActive: true,
    sortOrder: 4,
  },
  {
    question: 'لماذا لا تظهر نتيجتي أو تظهر كمحجوبة في صفحة النتائج؟',
    answer:
      'قد لا تظهر النتيجة لسببين: إما أن كشف رصد المقرر ما زال قيد المراجعة والاعتماد من الكنترول ولم يُنشر رسمياً بعد، أو وجود حجب إداري/مالي على الحساب. في حال وجود حجب، يرجى مراجعة شؤون الطلاب أو الحسابات، أو إرسال استفسار من تبويب «الشكاوى والتذاكر».',
    topics: ['النتائج'],
    keywords: [
      'نتيجة محجوبة',
      'النتيجة مش ظاهرة',
      'حجب النتيجة',
      'إظهار الدرجات',
      'الكنترول',
      'المصروفات',
    ],
    isActive: true,
    sortOrder: 5,
  },
  {
    question: 'كيف أفعّل البريد الأكاديمي الرسمي وما هي كلمة المرور الافتراضية؟',
    answer:
      'يظهر عنوان بريدك الأكاديمي الرسمي في كارت «البريد الأكاديمي الرسمي» بالصفحة الرئيسية وفي ملفك الشخصي. كلمة المرور الافتراضية عند التفعيل لأول مرة هي الرقم القومي كاملاً (14 رقماً) المسجل في ملفك بالمعهد، ويمكنك تسجيل الدخول مباشرة عبر Gmail.',
    topics: ['البريد الأكاديمي'],
    keywords: [
      'البريد الأكاديمي',
      'الايميل الجامعي',
      'ايميل المعهد',
      'gmail',
      'تفعيل الايميل',
      'كلمة مرور الايميل',
      'الرقم القومي',
    ],
    isActive: true,
    sortOrder: 6,
  },
  {
    question: 'ما الخدمات المتاحة عبر البريد الأكاديمي وماذا أفعل إذا نسيت كلمة مروره؟',
    answer:
      'يمنحك البريد الأكاديمي وصولاً كاملاً لخدمات Google Workspace مثل Gmail وGoogle Drive وGoogle Meet وGoogle Classroom. في حال نسيان كلمة المرور أو تعذر الدخول، أرسل تذكرة إلى «الدعم الفني» من تبويب الشكاوى مع توضيح كود الطالب ليتم إعادة تعيينها.',
    topics: ['البريد الأكاديمي'],
    keywords: [
      'نسيت باسورد الايميل',
      'استعادة البريد الأكاديمي',
      'google workspace',
      'drive',
      'classroom',
      'meet',
    ],
    isActive: true,
    sortOrder: 7,
  },
  {
    question: 'كيف أتابع نسبة الحضور والغياب الخاصة بي في كل مقرر؟',
    answer:
      'افتح صفحة «الحضور والغياب» من القائمة الجانبية لعرض إحصائيات حضورك وغيابك في المحاضرات والسكاشن لكل مقرر مسجل به خلال الفصل الدراسي، مع متابعة أي تنبيهات خاصة بنسبة الغياب.',
    topics: ['الحضور'],
    keywords: [
      'الحضور',
      'الغياب',
      'نسبة الحضور',
      'نسبة الغياب',
      'حرمان',
      'انذار غياب',
    ],
    isActive: true,
    sortOrder: 8,
  },
  {
    question: 'كيف يتم تسجيل حضوري في المحاضرات والسكاشن؟',
    answer:
      'عندما يفتح الدكتور أو المعيد جلسة الحضور داخل القاعة، يمكنك تسجيل حضورك عبر رمز الاستجابة السريعة (QR) أو الكود المباشر من صفحة «الحضور والغياب» مع تفعيل صلاحية الموقع الجغرافي إذا كانت الجلسة تتطلب التحقق من التواجد داخل المعهد.',
    topics: ['الحضور'],
    keywords: [
      'تسجيل الحضور',
      'qr',
      'باركود الحضور',
      'جلسة حضور',
      'اللوكيشن',
      'الموقع الجغرافي',
    ],
    isActive: true,
    sortOrder: 9,
  },
  {
    question: 'كيف أقدم شكوى أو استفسار لشؤون الطلاب أو الدعم الفني؟',
    answer:
      'اضغط على زر «تقديم شكوى جديدة» أعلى هذه الصفحة، ثم اختر نوع الطلب والجهة المختصة (شؤون الطلاب، الدعم الفني، الكنترول، الحسابات، أو الإرشاد الأكاديمي)، واكتب تفاصيل واضحة مع إمكانية إرفاق لقطة شاشة لتسريع الحل.',
    topics: ['الشكاوى'],
    keywords: [
      'تقديم شكوى',
      'شكوى',
      'استفسار',
      'شؤون الطلاب',
      'الدعم الفني',
      'تذكرة',
      'مشكلة تقنية',
    ],
    isActive: true,
    sortOrder: 10,
  },
  {
    question: 'كيف أتابع حالة تذكرتي والردود الواردة من الإدارة؟',
    answer:
      'انتقل إلى تبويب «الشكاوى والتذاكر» في هذه الصفحة لعرض جميع تذاكرك مع حالتها الحالية (قيد الانتظار، قيد المراجعة، جارٍ العمل، تم الحل، مغلقة). اضغط على «فتح المحادثة» لقراءة رد الموظف المختص وإرسال ردك مباشرة، كما يصلك إشعار عند إضافة أي رد جديد.',
    topics: ['الشكاوى'],
    keywords: [
      'متابعة الشكوى',
      'حالة التذكرة',
      'رقم التذكرة',
      'رد الإدارة',
      'المحادثة',
    ],
    isActive: true,
    sortOrder: 11,
  },
  {
    question: 'كيف أسجل الدخول لأول مرة وكيف أصل إلى المحاضرات والسكاشن وجدول الدراسة؟',
    answer:
      'يتم تسجيل الدخول لأول مرة باستخدام «كود الطالب» وكلمة المرور الافتراضية وهي «الرقم القومي»، وسيُطلب منك تغيير كلمة المرور فوراً لحماية حسابك. بعد الدخول، يمكنك استعراض وتحميل ملفات المحاضرات والسكاشن من صفحة «المقررات»، ومعرفة مواعيدك من «جدول المحاضرات والسكاشن».',
    topics: ['الحساب والمقررات'],
    keywords: [
      'تسجيل الدخول',
      'كود الطالب',
      'تغيير كلمة المرور',
      'نسيت كلمة المرور',
      'المحاضرات',
      'السكاشن',
      'المقررات',
      'جدول المحاضرات',
    ],
    isActive: true,
    sortOrder: 12,
  },

  // ===== English FAQs (101 - 112) =====
  {
    question: 'How can I view the official exam schedule?',
    answer:
      'Open "Exam Schedule" from the sidebar menu, or check the "Official Exam Timetable" card on your Student Dashboard to view and download the latest published midterm or final schedule.',
    topics: ['exams'],
    keywords: ['exam schedule', 'timetable', 'midterm dates', 'final dates', 'exams'],
    isActive: true,
    sortOrder: 101,
  },
  {
    question: 'How do I find my exam seat number and room location?',
    answer:
      'Go to "Exam Location" in the sidebar or check the "Exam Seating & Room" card on your Dashboard. Your seat number, building, floor, and room will appear as soon as seating assignments are published.',
    topics: ['exams'],
    keywords: ['exam place', 'exam location', 'seat number', 'room', 'building', 'floor'],
    isActive: true,
    sortOrder: 102,
  },
  {
    question: 'What are the exam entry rules and what should I do if I miss an exam due to an emergency?',
    answer:
      'Arrive early with your student ID card or national ID. For documented medical or force majeure excuses, submit the official supporting documents to Student Affairs within the deadline specified by institute regulations.',
    topics: ['exams'],
    keywords: ['missed exam', 'medical excuse', 'exam rules', 'student id', 'absence'],
    isActive: true,
    sortOrder: 103,
  },
  {
    question: 'Where can I see my midterm, final, and quiz grades?',
    answer:
      'Open "Results" from the sidebar to view your published midterm, final, and total course grades. For monthly or practical quizzes, open "Quiz Grades" to review your scores once released by your instructor.',
    topics: ['results'],
    keywords: ['results', 'grades', 'midterm', 'final', 'quiz grades', 'gpa'],
    isActive: true,
    sortOrder: 104,
  },
  {
    question: 'Why are my grades not visible or marked as withheld?',
    answer:
      'Grades appear only after the Control committee finishes reviewing, approving, and publishing the course sheet. If a result is marked as withheld due to an administrative or financial hold, please contact Student Affairs or submit a ticket in the Tickets tab.',
    topics: ['results'],
    keywords: ['withheld', 'missing grade', 'not published', 'control', 'tuition hold'],
    isActive: true,
    sortOrder: 105,
  },
  {
    question: 'How do I activate my official academic email and what is the default password?',
    answer:
      'Your official academic email address is displayed on the Dashboard and Profile pages. Your default initial password is your full 14-digit National ID registered with the institute, and you can sign in directly through Gmail.',
    topics: ['academic email'],
    keywords: ['academic email', 'gmail', 'default password', 'national id', 'activate email'],
    isActive: true,
    sortOrder: 106,
  },
  {
    question: 'What services are included with the academic email and how can I reset its password?',
    answer:
      'Your academic email grants full access to Google Workspace services including Gmail, Google Drive, Google Meet, and Google Classroom. If you forget your email password, submit a Technical Support ticket with your student code.',
    topics: ['academic email'],
    keywords: ['reset email password', 'google workspace', 'drive', 'meet', 'classroom'],
    isActive: true,
    sortOrder: 107,
  },
  {
    question: 'How can I track my attendance percentage for each course?',
    answer:
      'Open "Attendance" from the sidebar to inspect your lecture and section attendance statistics per course along with any absence warnings for the active semester.',
    topics: ['attendance'],
    keywords: ['attendance', 'absence', 'attendance rate', 'warnings', 'lectures'],
    isActive: true,
    sortOrder: 108,
  },
  {
    question: 'How do I check in to an active lecture or section attendance session?',
    answer:
      'When your lecturer or teaching assistant starts an attendance session, open the "Attendance" page to scan the QR code or enter the session code. Enable browser location access if on-campus verification is required.',
    topics: ['attendance'],
    keywords: ['qr code', 'check in', 'attendance session', 'location', 'geofence'],
    isActive: true,
    sortOrder: 109,
  },
  {
    question: 'How do I submit a complaint or inquiry to Student Affairs or Technical Support?',
    answer:
      'Click "New Complaint" at the top of this page, choose the ticket type and target department (Student Affairs, Technical Support, Control, Finance, or Academic Advising), provide clear details, and optionally attach a screenshot.',
    topics: ['complaints'],
    keywords: ['complaint', 'inquiry', 'support ticket', 'student affairs', 'technical support'],
    isActive: true,
    sortOrder: 110,
  },
  {
    question: 'How can I follow up on my ticket status and staff replies?',
    answer:
      'Switch to the "My Tickets & Complaints" tab on this page to view every ticket and its current status. Click "Open Chat" to read staff responses and send follow-up replies.',
    topics: ['complaints'],
    keywords: ['ticket status', 'follow up', 'ticket number', 'reply', 'chat'],
    isActive: true,
    sortOrder: 111,
  },
  {
    question: 'How do I sign in for the first time and access course materials and schedules?',
    answer:
      'Sign in initially with your Student Code and your National ID as the initial password; you will be prompted to set a new personal password immediately. Once signed in, download lecture/section materials from "Courses" and view your classes in "Lecture & Section Schedule".',
    topics: ['account & courses'],
    keywords: ['first login', 'student code', 'password reset', 'materials', 'lectures', 'courses', 'schedule'],
    isActive: true,
    sortOrder: 112,
  },
];
