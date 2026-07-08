import type { Connection } from 'mongoose';

export class ConnectionHolder {
  static connection?: Connection;
}
