import { Injectable, MessageEvent } from '@nestjs/common';
import { Observable, Subject, defer, finalize, map } from 'rxjs';

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
    markedByName?: string;
    markedByNameAr?: string;
    markedByNameEn?: string;
    deviceId?: string;
    deviceFingerprint?: string;
    deviceInfo?: string;
    ipAddress?: string;
    location?: {
      latitude: number;
      longitude: number;
      accuracy?: number;
    };
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
  private readonly sessionChannels = new Map<
    string,
    { events: Subject<AttendanceLiveEvent>; viewers: number }
  >();

  /**
   * Returns an Observable SSE message stream for clients connected to a session.
   */
  getEventStream(sessionId: string): Observable<MessageEvent> {
    return defer(() => {
      const channel = this.sessionChannels.get(sessionId) ?? {
        events: new Subject<AttendanceLiveEvent>(),
        viewers: 0,
      };
      channel.viewers += 1;
      this.sessionChannels.set(sessionId, channel);

      return channel.events.pipe(
        map((event) => ({ data: event })),
        finalize(() => {
          channel.viewers -= 1;
          if (
            channel.viewers === 0 &&
            this.sessionChannels.get(sessionId) === channel
          ) {
            this.sessionChannels.delete(sessionId);
          }
        }),
      );
    });
  }

  /**
   * Broadcasts a live check-in or update event to all staff members viewing the session.
   */
  publishEvent(sessionId: string, event: AttendanceLiveEvent): void {
    this.sessionChannels.get(sessionId)?.events.next(event);
  }

  /**
   * Closes the session's stream channel and cleans up memory.
   */
  closeSessionStream(sessionId: string): void {
    const channel = this.sessionChannels.get(sessionId);
    if (!channel) return;

    this.sessionChannels.delete(sessionId);
    channel.events.next({ type: 'SESSION_CLOSED', timestamp: new Date() });
    channel.events.complete();
  }
}
