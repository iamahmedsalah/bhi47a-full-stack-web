const dns = require('dns');
const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const dnsServers = String(process.env.DNS_SERVERS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

if (dnsServers.length > 0) {
  try {
    dns.setServers(dnsServers);
    console.log(`Applied DNS overrides: ${dnsServers.join(', ')}`);
  } catch (err) {
    console.warn(`Failed to apply custom DNS servers: ${err.message}`);
  }
}

const MONGODB_URI = process.env.MONGODB_URI;

async function run() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    // Get all users
    const users = await mongoose.connection.db.collection('users').find({ role: 'student' }).toArray();
    console.log('--- Students ---');
    users.forEach(u => {
      console.log(`Student ID: ${u._id}, Name: ${u.name}, Code: ${u.studentCode}`);
    });

    // Get all complaints
    const complaints = await mongoose.connection.db.collection('complaints').find({}).toArray();
    console.log('--- Complaints ---');
    complaints.forEach(c => {
      console.log(`Ticket: ${c.ticketNumber}, StudentID Ref: ${c.studentId}, StudentCode Ref: ${c.studentCode}, Title: ${c.title}, Status: ${c.status}`);
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected');
  }
}

run();
