# تشغيل الأسئلة الشائعة والمساعد الأكاديمي (RAG)

## الصفحات والبيانات

- الطالب يتصفح الأسئلة الشائعة المنشورة مباشرة من صفحة **«المساعدة والشكاوى»** (`/ar/dashboard/complaints?tab=faq` أو `/en/dashboard/complaints?tab=faq`) مع فلترة بالتصنيفات وبحث فوري، والمسار القديم `/dashboard/faq` يحوّل تلقائيًا لنفس التبويب. الصفحة والبحث يعملان حتى لو المساعد الذكي متوقف.
- الإدارة والموظف الإداري (`administrative` أو من يملك صلاحيتي `faqs.read` و `faqs.write`) يضيفون ويعدّلون وينشرون الأسئلة من `/ar/admin/faqs`، مع إمكانية تحميل 24 سؤالًا افتراضيًا معتمدًا (عربي وإنجليزي) بضغطة واحدة عبر زر **«تحميل الأسئلة الافتراضية»** (`POST /api/admin/faqs/seed-defaults`) أو عبر `pnpm --filter @student-portal/api run seed:faqs`.
- اكتب الإجراءات العامة فقط في الـ FAQ. البيانات الفردية تفضل موجودة في البوابة. لا تضف أرقامًا قومية أو كشوف درجات أو بيانات دخول إلى محتوى الـ FAQ.

## معمارية الـ RAG وفهرسة كتب وتوصيف المقررات (PDF RAG Pipeline)

1. **الفهرسة التلقائية في الخلفية (`RagIngestionService`):**
   - عند رفع أو تحديث كتاب/توصيف المقرر (`POST /api/courses/:id/syllabus`)، يتم حفظ الملف والتحقق من توقيعه وحساب `sha256`، ثم جدولة مهمة BullMQ في طابور `rag-ingestion` بمعرّف حتمي `rag-syllabus:<courseId>:<sha256>` لمنع تكرار المهام.
   - تقوم `PdfTextExtractionService` باستخراج النص صفحة بصفحة بحدود ذاكرة آمنة، مع كشف الملفات التالفة (`CORRUPT_PDF`)، المشفرة (`ENCRYPTED_PDF`)، الفارغة (`EMPTY_PDF`)، أو الممسوحة ضوئيًا بدون نص (`SCANNED_PDF_NO_TEXT` مع دعم OCR اختياري عبر Gemini عند تفعيل `RAG_OCR_ENABLED=true`).
   - تقسم `chunkDocumentPages` النص مع الحفاظ على حدود الفقرات والجمل ورقم الصفحة والتداخل (`overlap`)، ثم تولّد `GeminiProvider.embedBatch` المتجهات على دفعات مع `TaskType.RETRIEVAL_DOCUMENT` وExponential Backoff.
   - تُنشر المقاطع في `rag_chunks` والوثيقة في `rag_documents` ذريًا بعد التحقق من أن نسخة `sha256` ما زالت هي النسخة النشطة على المقرر، وتُحذف أي مقاطع لنسخ أقدم فورًا. وعند حذف منهج المقرر يتم تنظيف فهرسه فورًا عبر `removeCourseIndex`.

2. **عزل الصلاحيات والاسترجاع الهجين وتوثيق المصادر (`RagDocumentSearchService`):**
   - **عزل صارم على السيرفر:** الطالب المحجوب ماليًا/إداريًا (`isBlocked: true`) لا يسترجع أي مقاطع. الطالب النشط يسترجع فقط من المقررات المسجلة المعتمدة له أو مقررات مستواه وقسمه وفصله الدراسي بشرط مطابقة `sha256` للنسخة النشطة.
   - **توسيع الاستعلام والبحث الهجين (P2 Hybrid Search & MMR Reranking):** يتم توسيع المرادفات الأكاديمية العربية والإنجليزية، ودمج تشابه المتجهات (`cosineSimilarity`) مع التطابق المعجمي وإزالة المقاطع المتكررة (MMR Deduplication).
   - **توثيق المصادر ومنع الهلوسة:** تُمرر المقاطع إلى Gemini داخل وسوم `<document_excerpt id="S1">` كبيانات غير موثوقة، ويُلزم النموذج بالإشارة لمعرّف المقطع `[S1]` فقط. يتحقق السيرفر من المعرفات ويستخرج اسم المقرر واسم الملف ورقم الصفحة الحقيقيين ويعرضها للطالب كشارات مصدر أسفل الرد.

## تفعيل الإنتاج على الـ VPS

```dotenv
STUDENT_AI_ENABLED=true
GEMINI_API_KEY=<server-secret>
GEMINI_CHAT_MODEL=gemini-2.5-flash
GEMINI_EMBEDDING_MODEL=gemini-embedding-001
RAG_OCR_ENABLED=false
# اختياري: اتركه فارغاً لاستخدام البحث الهجين الداخلي، أو ضع اسم الفهرس بعد إنشائه على MongoDB Atlas
RAG_ATLAS_VECTOR_INDEX=rag_chunks_vector_index
```

### إعداد فهرس MongoDB Atlas Vector Search (اختياري عند استخدام `RAG_ATLAS_VECTOR_INDEX`)
في لوحة **MongoDB Atlas -> Atlas Search -> Create Search Index -> Atlas Vector Search (JSON Editor)**:
- **Database & Collection:** اختر قاعدة بيانات المشروع والمجموعة `rag_chunks`
- **Index Name:** `rag_chunks_vector_index`
- **JSON Definition:**
```json
{
  "fields": [
    {
      "type": "vector",
      "path": "embedding",
      "numDimensions": 3072,
      "similarity": "cosine"
    },
    { "type": "filter", "path": "courseId" },
    { "type": "filter", "path": "sha256" },
    { "type": "filter", "path": "isActive" },
    { "type": "filter", "path": "embeddingModel" }
  ]
}
```

## واجهة إدارة المحتوى
```http
GET /api/faqs
POST /api/faqs/chat
GET /api/admin/faqs
POST /api/admin/faqs
POST /api/admin/faqs/seed-defaults
POST /api/admin/faqs/bulk-delete
PATCH /api/admin/faqs/:id
DELETE /api/admin/faqs/:id
```
