import mongoose, { Types } from 'mongoose';

/** Read-only production diagnostic. Emits counts, never credentials or staff details. */
async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required');
  const connection = await mongoose
    .createConnection(uri, {
      maxPoolSize: 2,
      serverSelectionTimeoutMS: 10000,
    })
    .asPromise();
  try {
    const db = connection.db!;
    const staff = await db
      .collection('users')
      .find(
        { role: 'staff' },
        {
          projection: { _id: 1, isActive: 1 },
        },
      )
      .toArray();
    const staffIds = new Set(staff.map((user) => String(user._id)));
    const assignedStaff = new Set<string>();
    const counts = {
      courses: 0,
      activeCourses: 0,
      activeCoursesWithStaff: 0,
      coursesWithLegacyReferences: 0,
      unknownStaffReferences: 0,
    };
    const cursor = db.collection('courses').find(
      {},
      {
        projection: {
          isActive: 1,
          doctorId: 1,
          doctorIds: 1,
          doctors: 1,
          teachingAssistantIds: 1,
          teachingAssistants: 1,
          teachingAssistantId: 1,
          teachingAssistant: 1,
        },
      },
    );
    for await (const course of cursor) {
      counts.courses++;
      if (course.isActive === true) counts.activeCourses++;
      const array = (value: unknown): unknown[] =>
        Array.isArray(value) ? value : [];
      const references = [
        course.doctorId,
        course.teachingAssistantId,
        course.teachingAssistant,
        ...array(course.doctorIds),
        ...array(course.teachingAssistantIds),
        ...array(course.doctors),
        ...array(course.teachingAssistants),
      ]
        .map((value: unknown) =>
          value && typeof value === 'object' && '_id' in value
            ? value._id
            : value,
        )
        .filter(
          (value: unknown) =>
            value instanceof Types.ObjectId || typeof value === 'string',
        );
      const unique = new Set(references.map(String));
      let hasStaff = false;
      for (const id of unique) {
        if (staffIds.has(id)) {
          assignedStaff.add(id);
          hasStaff = true;
        } else counts.unknownStaffReferences++;
      }
      if (course.isActive === true && hasStaff) counts.activeCoursesWithStaff++;
      if (
        course.teachingAssistantId ||
        course.teachingAssistant ||
        references.some((value) => typeof value === 'string')
      )
        counts.coursesWithLegacyReferences++;
    }
    console.log(
      JSON.stringify(
        {
          database: db.databaseName,
          ...counts,
          staffAccounts: staff.length,
          activeStaffAccounts: staff.filter((user) => user.isActive === true)
            .length,
          staffWithStoredAssignments: assignedStaff.size,
        },
        null,
        2,
      ),
    );
  } finally {
    await connection.close();
  }
}

void main().catch(() => {
  console.error(
    'Assignment audit failed. Check database configuration and connectivity; no changes were made.',
  );
  process.exitCode = 1;
});
