// utils/matchScore.util.ts
interface Skill {
  name: string;
  // weight?: number; // if you want to use later
}

interface JobLocation {
  city?: string;
  state?: string;
  country?: string;
  remote?: boolean;
}

interface JobSalary {
  min?: number;
  max?: number;
  currency?: string;
}

interface JobExperience {
  min?: number;
  max?: number;
  level?: string; // e.g. "entry", "senior", etc.
}

interface Job {
  skills: Skill[];
  location?: JobLocation;
  salary?: JobSalary;
  experience?: JobExperience;
  // ... other fields
}

interface UserProfile {
  skills?: string[];               // array of skill names
  experienceYears?: number;        // total years of experience
  preferredLocation?: string;      // city or "remote"
  expectedSalary?: number;         // minimum expected salary
  preferredJobTypes?: string[];    // optional future use
  // ... other relevant fields
}

/**
 * Calculates compatibility score between a user profile and a job posting
 * @param job - The job object
 * @param user - The user profile object
 * @returns Score between 0 and 100
 */
export const calculateMatchScore = (job: Job, user: UserProfile = {}): number => {
  let score = 0;
  const weights = {
    skills: 0.45,          // most important
    experience: 0.25,
    location: 0.18,
    salary: 0.12,
  };

  // ── 1. Skills Match (45%)
  if (user.skills?.length && job.skills?.length) {
    const userSkills = new Set(user.skills.map(s => s.toLowerCase().trim()));
    const jobSkillNames = job.skills.map(s => s.name?.toLowerCase().trim() || '');

    let matched = 0;
    for (const jobSkill of jobSkillNames) {
      if (userSkills.has(jobSkill)) {
        matched++;
      }
      // Optional: partial matching (e.g. "react.js" matches "react")
      else if (jobSkill.includes('react') && userSkills.has('react')) {
        matched += 0.7;
      }
    }

    const skillRatio = matched / jobSkillNames.length;
    score += skillRatio * (weights.skills * 100);
  }

  // ── 2. Experience Match (25%)
  if (typeof user.experienceYears === 'number' && job.experience) {
    const { min = 0, max = 50 } = job.experience;

    if (user.experienceYears >= min && user.experienceYears <= max) {
      score += weights.experience * 100; // perfect
    }
    else if (user.experienceYears > max) {
      score += weights.experience * 70;  // overqualified (still good)
    }
    else if (user.experienceYears >= min * 0.7) {
      score += weights.experience * 50;  // slightly underqualified
    }
    // below 70% of min → very low score
  }

  // ── 3. Location Match (18%)
  if (job.location) {
    if (job.location.remote) {
      score += weights.location * 100; // remote = always good
    }
    else if (user.preferredLocation) {
      const userLoc = user.preferredLocation.toLowerCase().trim();

      if (
        job.location.city?.toLowerCase().includes(userLoc) ||
        job.location.state?.toLowerCase().includes(userLoc) ||
        job.location.country?.toLowerCase().includes(userLoc)
      ) {
        score += weights.location * 100;
      }
    }
  }

  // ── 4. Salary Match (12%)
  if (typeof user.expectedSalary === 'number' && job.salary?.max) {
    if (job.salary.max >= user.expectedSalary) {
      score += weights.salary * 100;
    } else if (job.salary.max >= user.expectedSalary * 0.85) {
      score += weights.salary * 60; // close enough
    }
  }

  // Final clamping & rounding
  return Math.round(Math.min(Math.max(score, 0), 100));
};