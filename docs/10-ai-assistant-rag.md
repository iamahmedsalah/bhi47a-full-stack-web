# 10 - AI Assistant

## MVP
Use FAQ chatbot.

## FAQ Topics
- login help
- forgot password
- academic email
- viewing grades
- course quizzes
- attendance
- exam schedule
- exam place
- complaint process

## Admin FAQ Management
```http
GET /api/admin/faqs
POST /api/admin/faqs
PATCH /api/admin/faqs/:id
DELETE /api/admin/faqs/:id
```

## Later RAG
Add:
- PDF upload
- chunking
- embeddings
- Qdrant/Pinecone
- OpenAI
