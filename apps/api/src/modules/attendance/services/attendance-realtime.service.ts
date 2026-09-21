import { Injectable, MessageEvent } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { map } from 'rxjs/operators';

export interface AttendanceLiveEvent {
  type: 'CHECK_IN' | 'STATUS_CHANGE' | 'SESSION_CLOSED' | 'SESSION_EXPIRED';
  record?: {
    id: string;
    studentId: string;
    studentCode: string;
    studentName: string;
    status: string;
    method: string;
    checkedInAt: Date;
    note?: string;
  };
  stats?: {
    totalCheckedIn: number;
    presentCount: number;
    lateCount: number;
  };
  timestamp: Date;
}

@Injectable()
export class AttendanceRealtimeService {
  private sessionChannels = new Map<string, Subject<AttendanceLiveEvent>>();

  /**
   * Retrieves or creates an RxJS Subject stream for an active attendance session.
   */
  private getOrCreateSubject(sessionId: string): Subject<AttendanceLiveEvent> {
    let subject = this.sessionChannels.get(sessionId);
    if (!subject) {
      subject = new Subject<AttendanceLiveEvent>();
      this.sessionChannels.set(sessionId, subject);
    }
    return subject;
  }

  /**
   * Returns an Observable SSE message stream for clients connected to a session.
   */
  getEventStream(sessionId: string): Observable<MessageEvent> {
    const subject = this.getOrCreateSubject(sessionId);
    return subject.asObservable().pipe(
      map((event) => ({
        data: event,
      })),
    );
  }

  /**
   * Broadcasts a live check-in or update event to all staff members viewing the session.
   */
  publishEvent(sessionId: string, event: AttendanceLiveEvent): void {
    const subject = this.sessionChannels.get(sessionId);
    if (subject) {
      subject.next(event);
    }
  }

  /**
   * Closes the session's stream channel and cleans up memory.
   */
  closeSessionStream(sessionId: string): void {
    const subject = this.sessionChannels.get(sessionId);
    if (subject) {
      subject.next({
        type: 'SESSION_CLOSED',
        timestamp: new Date(),
      });
      subject.complete();
      this.sessionChannels.delete(sessionId);
    }
  }
}
