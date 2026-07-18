# دليل تجهيز ملف Excel للمقررات الدراسية (Courses Import Guide)

هذا الدليل يشرح بالتفصيل أفضل هيكل وجدول بيانات لاستيراد المقررات الدراسية إلى نظام بوابة الطلاب عبر ملف Excel (`.xlsx` أو `.xls` أو `.csv`).

---

## 1. هيكل الأعمدة المطلوبة والموصى بها (Column Structure)

يدعم النظام قراءة رؤوس الأعمدة سواء باللغة **الإنجليزية** أو **العربية**:

| اسم العمود في Excel (English) | اسم العمود بالعربية | الحالة | القيم المتاحة / الوصف | مثال |
| :--- | :--- | :---: | :--- | :--- |
| `courseCode` | `كود المادة` | 🔴 **إجباري** | كود فريد للمقرر (بدون مسافات) | `MIS301` |
| `courseName` | `اسم المادة` | 🔴 **إجباري** | اسم المقرر المعتمد | `قواعد البيانات` |
| `courseNameAr` | `اسم المادة بالعربية` | 🟡 موصى به | اسم المقرر باللغة العربية | `قواعد البيانات` |
| `courseNameEn` | `اسم المادة بالإنجليزية` | 🟡 موصى به | اسم المقرر باللغة الإنجليزية | `Databases` |
| `level` | `المستوى` | 🔴 **إجباري** | المستوى الدراسي (`1`, `2`, `3`, `4`) | `3` |
| `semester` | `الفصل الدراسي` | 🔴 **إجباري** | الترم (`first` أو `second` أو `summer`) | `first` |
| `department` | `القسم العلمي` | 🟢 اختياري | اسم القسم التابع له المقرر | `BIS` / `General` |
| `creditHours` | `الساعات المعتمدة` | 🟢 اختياري | عدد الساعات المعتمدة للمقرر (الافتراضي: 3) | `3` |
| `type` | `نوع المقرر` | 🟢 اختياري | `required` (إجباري), `elective` (اختياري), `university_req` (متطلب جامعة), `institute_req` (متطلب معهد), `specialization_req` (متطلب تخصص) | `required` |
| `prerequisites` | `المتطلبات السابقة` | 🟢 اختياري | أكواد المواد السابقة المطلوبة مفصولة بفاصلة `,` | `MIS202` أو `IT302, MIS401` |
| `coRequisites` | `المتطلبات المتزامنة` | 🟢 اختياري | أكواد المواد التي يجب تسجيلها معاً في نفس الترم | `CS101L` *(أو اتركه فارغاً)* |
| `equivalentCourses` | `المقررات المعادلة` | 🟢 اختياري | أكواد المواد المعادلة لهذا المقرر | `ACC100` *(أو اتركه فارغاً)* |
| `offeredTerms` | `فصول الطرح` | 🟢 اختياري | الفصول المتاح فيها طرح المقرر (`first, second`) | `first, second` *(أو فارغ)* |
| `recommendedSemester` | `الفصل الموصى به` | 🟢 اختياري | رقم الترم من 1 إلى 8 حسب الخطة الدراسية | `5` |
| `minimumGpa` | `الحد الأدنى للمعدل` | 🟢 اختياري | الحد الأدنى للمعدل التراكمي المسموح للتسجيل | `2.0` *(أو فارغ)* |
| `registrationPriority` | `أولوية التسجيل` | 🟢 اختياري | رقم الأولوية في التسجيل والإرشاد الأكاديمي | `1` |
| `description` | `وصف المقرر` | 🟢 اختياري | نبذة مختصرة عن محتوى المقرر العلمي | `دراسة مفاهيم وتصميم قواعد البيانات...` |
| `status` | `الحالة` | 🟢 اختياري | حالة المقرر (`Active` / `Inactive`) | `Active` |

---

## 2. جدول البيانات المنقح والشامل (Cleaned & Standardized Excel Sheet)

إليك جدول البيانات المستخرج من قائمتك بعد **تنظيف النصوص المفصولة** وتصحيح الأخطاء الإملائية وتنظيم الفواصل للمتطلبات السابقة:

```tsv
courseCode	courseName	courseNameAr	courseNameEn	level	semester	department	creditHours	type	prerequisites	status
MIS301	Databases	قواعد البيانات	Databases	3	first	BIS	3	required	MIS202	Active
BOA301	Banking office applications	تطبيقات المكتب المصرفي	Banking office applications	3	first	BIS	3	required		Active
CSD301	Computer software design	تصميم برامج الحاسب	Computer software design	3	first	BIS	3	required	MIS202	Active
IP301	Investment principles	مبادئ الاستثمار	Investment principles	3	first	BIS	3	required	FIN202	Active
MIS302	Systems Analysis and Design	تحليل وتصميم نظم المعلومات	Systems Analysis and Design	3	second	BIS	3	required	MIS202	Active
EB302	Entrepreneurship and small businesses	ريادة الأعمال والمشروعات الصغيرة	Entrepreneurship and small businesses	3	second	BIS	3	required	BUS101	Active
MIS401	Enterprise Systems	نظم معلومات المؤسسات	Enterprise Systems	4	first	BIS	3	required	MIS202	Active
MIS402	Information Systems Strategy	إستراتيجية نظم المعلومات	Information Systems Strategy	4	second	BIS	3	required	IT302, MIS401	Active
EB402	E-business	الأعمال الإلكترونية	E-business	4	second	BIS	3	required	MIS202	Active
HR402	Human resources management	إدارة الموارد البشرية	Human resources management	4	second	BIS	3	required		Active
MKT201	Principles of Marketing	مبادئ التسويق	Principles of Marketing	2	first	General	3	required	BUS101	Active
MCA201	Principles of Cost Accounting	مبادئ محاسبة التكاليف	Principles of Cost Accounting	2	first	General	3	required	ACC101	Active
LSM201	Logistics and Supply Chain Management	إدارة اللوجستيات وسلاسل الإمداد	Logistics and Supply Chain Management	2	first	General	3	required		Active
MTH102	Business Mathematics	رياضيات الأعمال	Business Mathematics	1	second	General	3	required		Active
STA401	Applied Statistics	الإحصاء التطبيقي	Applied Statistics	4	first	BIS	3	required	MTH102	Active
QDM401	Quantitative methods and decision-making	الأساليب الكمية واتخاذ القرارات	Quantitative methods and decision-making	4	first	BIS	3	required		Active
BADM401	Business analytics and data mining	تحليلات الأعمال والتنقيب في البيانات	Business analytics and data mining	4	first	BIS	3	required		Active
IT102	Innovative thinking	التفكير الابتكاري	Innovative thinking	1	second	General	3	required		Active
CMS102	Communication methods and skills	طرق ومهارات الاتصال	Communication methods and skills	1	second	General	3	required		Active
OB102	Organizational behavior	السلوك التنظيمي	Organizational behavior	1	second	General	3	required		Active
IC102	Introduction to computers	مقدمة في الحاسبات	Introduction to computers	1	second	General	3	required		Active
IOS102	Introduction to operating systems	مقدمة في نظم التشغيل	Introduction to operating systems	1	second	General	3	required		Active
SM302	Strategic management	الإدارة الاستراتيجية	Strategic management	3	second	BIS	3	required		Active
ACCG302	Accounting in government units	المحاسبة في الوحدات الحكومية	Accounting in government units	3	second	BIS	3	required		Active
```

---

## 3. نصائح هامة لضمان الاستيراد بدون أخطاء (Best Practices)

1. **المتطلبات السابقة المتعددة (`prerequisites`)**:
   - إذا كانت المادة تحتاج أكثر من مادة سابقة (مثل `MIS402`), اكتب الكودين بينهما فاصلة عادية: `IT302, MIS401`.

2. **قيم الفصل الدراسي (`semester`)**:
   - استخدم `first` للترم الأول، و`second` للترم الثاني، و`summer` للترم الصيفي.

3. **قيم المستوى الدراسي (`level`)**:
   - اكتب أرقام المستويات كأرقام مجردة: `1`, `2`, `3`, `4`.

## 4. كيفية طـرح مـادة في الصـيف (How to Open/Offer a Course in Summer)

توجد **طريقتان (2 Ways)** لطرح مقرر في التـرم الصيفي (`summer`):

### الطريقة الأولى: المقرر مخصص رئيسياً للترم الصيفي
إذا كانت المادة تدرس أصلاً في الصيف فقط، اجعل قيمة عمود `semester` هي `summer`:
- **`semester`**: `summer`
- **`offeredTerms`**: *(يمكنك تركه فارغاً أو كتابة `summer`)*

**مثال في Excel:**
```tsv
courseCode	courseName	level	semester	offeredTerms
SUM101	Summer Training	2	summer	summer
```

---

### الطريقة الثانية: مقرر ترم أخير/أساسي يُطرح أيضاً في الصيف (مثلاً `MIS301`)
إذا كانت المادة مادة ترم أول (`first`) أو ترم ثاني (`second`)، ولكن يريد المعهد فتحها للطلاب في الصيف أيضاً، استخدم عمود **`offeredTerms`** (فصول الطرح):
- **`semester`**: `first` *(الترم الأساسي مادة ترم أول)*
- **`offeredTerms`**: `first, summer` *(أو بالأصل `الأول، الصيفي`)*

**مثال في Excel:**
```tsv
courseCode	courseName	level	semester	offeredTerms
MIS301	Databases	3	first	first, summer
```

> **ملاحظة**: يدعم نظام الاستيراد قراءة المفاهيم بالعربية والإنجليزية تلقائياً: (`first, summer` أو `الأول، الصيفي` أو `1, 3`).

