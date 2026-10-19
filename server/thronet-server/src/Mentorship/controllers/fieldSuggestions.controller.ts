import { Request, Response } from 'express';
import Mentor from '@/Mentorship/models/Mentor';
import { MentorStatus } from '@/Mentorship/interface/mentor.types';

const FIELD_PATH = {
  company: 'company',
  college: 'college',
  degree: 'degree',
  branch: 'branch',
  role: 'experience.currentRole',
  skills: 'skills',
} as const;

type Field = keyof typeof FIELD_PATH;

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const getFieldSuggestions = async (req: Request, res: Response) => {
  try {
    const field = String(req.query.field || '') as Field;
    const path = FIELD_PATH[field];
    if (!path) {
      return res.status(400).json({ success: false, message: 'Invalid field', data: [] });
    }

    const q = String(req.query.q || '').trim().slice(0, 50);
    const limit = Math.min(Math.max(parseInt(String(req.query.limit), 10) || 8, 1), 15);
    if (q.length < 2) {
      return res.json({ success: true, data: [] });
    }

    const safe = escapeRegex(q);
    const contains = new RegExp(safe, 'i');

    const pipeline: any[] = [
      { $match: { isDeleted: false, status: MentorStatus.ACTIVE, [path]: contains } },
    ];
    if (field === 'skills') {
      pipeline.push({ $unwind: '$skills' }, { $match: { skills: contains } });
    }
    pipeline.push(
      { $group: { _id: { $toLower: `$${path}` }, name: { $first: `$${path}` }, count: { $sum: 1 } } },
      {
        $addFields: {
          rank: {
            $cond: [{ $regexMatch: { input: '$name', regex: `^${safe}`, options: 'i' } }, 0, 1],
          },
        },
      },
      { $sort: { rank: 1, count: -1, name: 1 } },
      { $limit: limit },
    );

    const rows = await Mentor.aggregate(pipeline);
    const data = rows.map((r: any) => String(r.name).trim()).filter(Boolean);

    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch suggestions', data: [] });
  }
};