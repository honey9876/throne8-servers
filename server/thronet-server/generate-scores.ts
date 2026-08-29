import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import path from 'path';

// Fix paths for imports
dotenv.config({ path: path.resolve(__dirname, '.env') });

// Assuming this script runs inside the thronet-server directory
import Mentor from './src/Mentorship/models/Mentor';
import { TrustScoreService } from './src/Mentorship/services/trustScore.service';

async function generateScores() {
  try {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('No MONGODB_URI in env');
    await mongoose.connect(uri);
    console.log('[DEBUG] Connected to MongoDB.');

    // Fetch all mentors
    const mentors = await Mentor.find({});
    console.log(`[DEBUG] Found ${mentors.length} mentors. Generating Trust Scores...`);

    for (const mentor of mentors) {
      if (mentor.mentorId) {
        console.log(`Recalculating for Mentor: ${mentor.mentorId}`);
        await TrustScoreService.recalculate(mentor.mentorId);
      }
    }

    console.log('[DEBUG] Finished Trust Score generation!');
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('[ERROR]', err);
    process.exit(1);
  }
}

generateScores();
