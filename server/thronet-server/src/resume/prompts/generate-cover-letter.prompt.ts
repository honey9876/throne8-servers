interface GenerateCoverLetterPromptInput {
  targetRole: string;
  jobDescription?: string;
  companyName?: string;
  companyInfo?: string;
  candidateProfile: unknown;
}

export const buildGenerateCoverLetterPrompt = ({
  targetRole,
  jobDescription,
  companyName,
  companyInfo,
  candidateProfile,
}: GenerateCoverLetterPromptInput) => `
You are an expert professional cover letter writer.

Your task is to write a complete, ATS-friendly, professional cover letter for the candidate described below, for the target role: "${targetRole}".

CANDIDATE PROFILE (source of truth — use only facts present here, never invent experience, companies, metrics, or skills the candidate does not have):
${JSON.stringify(candidateProfile, null, 2)}

${
  jobDescription
    ? `JOB DESCRIPTION (tailor the letter closely to this — mirror its key requirements, responsibilities, and keywords wherever the candidate's real experience supports it):\n${jobDescription}`
    : `NO JOB DESCRIPTION WAS PROVIDED. Instead, write the letter for this company:\nCompany name: ${companyName || "the company"}\nCompany info: ${companyInfo || "No additional company info provided."}\nSince there is no specific job posting, keep the letter focused on the candidate's general strengths and enthusiasm for the role and company rather than claiming to address specific JD requirements.`
}

WRITING RULES:
- 3 to 5 short-to-medium paragraphs total for the body (opening + middle paragraph(s) + closing), each 3-5 sentences. Do not write a novel.
- Opening paragraph: who the candidate is, the role they're applying for, and a strong hook (a standout, real achievement or genuine enthusiasm).
- Middle paragraph(s): the candidate's most relevant real experience/projects/skills, tied to the target role (and JD if provided).
- Closing paragraph: a call to action (availability for interview) and thanks for their time.
- Professional, confident, natural tone. No clichés like "I am a hard worker" with nothing to back it up.
- Never fabricate companies, job titles, dates, metrics, or technologies not present in the candidate profile.
- Do not include placeholder text like "[Company Name]" — use the real company name if known, otherwise phrase generically without brackets.

Return ONLY valid JSON. No markdown, no code fences, no commentary. Return EXACTLY this structure:

{
  "personalInfo": {
    "fullName": "",
    "location": "",
    "phone": "",
    "email": "",
    "github": "",
    "linkedIn": ""
  },
  "recipient": {
    "date": "",
    "recipientName": "Hiring Manager",
    "companyName": "${companyName || ""}",
    "companyLocation": "",
    "subject": "Application for ${targetRole} Position",
    "greeting": "Dear Hiring Manager,"
  },
  "body": {
    "opening": "",
    "paragraphs": ["", ""],
    "closing": ""
  },
  "closing": {
    "signOff": "Sincerely,",
    "fullName": ""
  }
}

Fill personalInfo and closing.fullName from the candidate profile's contact details. Leave "date" as an empty string (the app fills today's date automatically). "paragraphs" should contain 1 to 3 middle body paragraphs (not the opening or closing, which have their own fields).
`;
