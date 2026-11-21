import { AttendanceRealtimeService } from './attendance-realtime.service';

describe('attendance real-time channels', () => {
  it('allocates channels for subscribers and removes them after the last disconnect', () => {
    const service = new AttendanceRealtimeService();
    const channels = Reflect.get(service, 'sessionChannels') as Map<
      string,
      unknown
    >;
    const stream = service.getEventStream('session');
    expect(channels.size).toBe(0);

    const first = stream.subscribe();
    const next = jest.fn();
    const second = stream.subscribe(next);
    expect(channels.size).toBe(1);

    first.unsubscribe();
    const event = { type: 'CHECK_IN' as const, timestamp: new Date() };
    service.publishEvent('session', event);
    expect(next).toHaveBeenCalledWith({ data: event });

    second.unsubscribe();
    expect(channels.size).toBe(0);
    const reconnect = stream.subscribe(next);
    service.publishEvent('session', event);
    expect(next).toHaveBeenCalledTimes(2);
    reconnect.unsubscribe();
    expect(channels.size).toBe(0);
  });

  it('sends the close event before completing each subscriber', () => {
    const service = new AttendanceRealtimeService();
    const next = jest.fn();
    const complete = jest.fn();
    const stream = service.getEventStream('session');
    stream.subscribe({ next, complete });
    stream.subscribe({ next, complete });

    service.closeSessionStream('session');

    expect(next).toHaveBeenCalledTimes(2);
    expect(next).toHaveBeenCalledWith({
      data: { type: 'SESSION_CLOSED', timestamp: expect.any(Date) },
    });
    expect(complete).toHaveBeenCalledTimes(2);
  });
});
