import { logger } from "../../shared/logger.util";

interface ATSAnalysisResult {
  atsScore: number;
  scannedAt: Date;
  sections: {
    contactInfo: boolean;
    summary: boolean;
    experience: boolean;
    education: boolean;
    skills: boolean;
    certifications: boolean;
    projects: boolean;
  };
  keywords: string[];
  missingKeywords: string[];
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  formatting: {
    score: number;
    issues: string[];
  };
  content: {
    score: number;
    wordCount: number;
    pageCount: number;
  };
}

class ATSScanner {
  private commonKeywords = [
    'leadership',
    'management',
    'development',
    'analysis',
    'communication',
    'project',
    'team',
    'strategy',
    'planning',
    'execution',
    'problem-solving',
    'collaboration',
    'agile',
    'innovation',
    'optimization',
    'performance',
    'implementation',
    'coordination',
    'stakeholder',
    'budget',
  ];

  private technicalKeywords = [
    'javascript',
    'typescript',
    'python',
    'java',
    'react',
    'node',
    'aws',
    'docker',
    'kubernetes',
    'mongodb',
    'sql',
    'api',
    'microservices',
    'ci/cd',
    'git',
    'rest',
    'graphql',
    'testing',
    'security',
    'cloud',
  ];

  /**
   * Analyze resume and return ATS score
   */
  async analyzeResume(fileBuffer: Buffer, mimeType: string): Promise<ATSAnalysisResult> {
    try {
      logger.info('Starting ATS analysis...');

      // Extract text from resume
      const text = await this.extractText(fileBuffer, mimeType);

      // Analyze sections
      const sections = this.detectSections(text);

      // Analyze keywords
      const keywords = this.extractKeywords(text);
      const missingKeywords = this.findMissingKeywords(keywords);

      // Analyze formatting
      const formatting = this.analyzeFormatting(text);

      // Analyze content
      const content = this.analyzeContent(text);

      // Calculate strengths and weaknesses
      const strengths = this.calculateStrengths(sections, keywords, formatting, content);
      const weaknesses = this.calculateWeaknesses(sections, keywords, formatting, content);

      // Generate suggestions
      const suggestions = this.generateSuggestions(sections, keywords, formatting, content);

      // Calculate overall ATS score
      const atsScore = this.calculateATSScore(sections, keywords, formatting, content);

      logger.info(`ATS analysis completed. Score: ${atsScore}`);

      return {
        atsScore,
        scannedAt: new Date(),
        sections,
        keywords,
        missingKeywords,
        strengths,
        weaknesses,
        suggestions,
        formatting,
        content,
      };
    } catch(error : any) {
      logger.error('Failed to analyze resume:', error);
      throw new Error('Resume analysis failed');
    }
  }

  /**
   * Extract text from PDF or DOCX
   */
  private async extractText(_fileBuffer: Buffer, mimeType: string): Promise<string> {
    // NOTE: In production, use libraries like pdf-parse or mammoth
    // For now, we'll simulate text extraction

    try {
      if (mimeType === 'application/pdf') {
        // Simulate PDF text extraction
        logger.info('Simulating PDF text extraction...');
        return this.simulateResumeText();
      } else if (
        mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        mimeType === 'application/msword'
      ) {
        // Simulate DOCX text extraction
        logger.info('Simulating DOCX text extraction...');
        return this.simulateResumeText();
      } else {
        throw new Error('Unsupported file type');
      }
    } catch(error : any) {
      logger.error('Text extraction failed:', error);
      return this.simulateResumeText();
    }
  }

  /**
   * Simulate resume text for testing
   */
  private simulateResumeText(): string {
    return `
      John Doe
      Software Engineer
      john.doe@email.com | +1-234-567-8900 | LinkedIn: linkedin.com/in/johndoe
      
      PROFESSIONAL SUMMARY
      Experienced software engineer with 5+ years in full-stack development, specializing in JavaScript, React, Node.js, and cloud technologies. Proven track record in leading teams and delivering scalable solutions.
      
      EXPERIENCE
      Senior Software Engineer | Tech Company | 2020 - Present
      - Led development of microservices architecture using Node.js and AWS
      - Implemented CI/CD pipelines reducing deployment time by 40%
      - Mentored team of 5 junior developers
      
      Software Engineer | Startup Inc | 2018 - 2020
      - Developed React-based web applications
      - Collaborated with cross-functional teams
      - Improved application performance by 30%
      
      EDUCATION
      Bachelor of Science in Computer Science | University | 2018
      
      SKILLS
      JavaScript, TypeScript, React, Node.js, Python, AWS, Docker, MongoDB, SQL, Git, Agile
      
      CERTIFICATIONS
      AWS Certified Solutions Architect
      Certified Scrum Master
    `;
  }

  /**
   * Detect resume sections
   */
  private detectSections(text: string): ATSAnalysisResult['sections'] {
    const lowerText = text.toLowerCase();

    return {
      contactInfo: /email|phone|linkedin|github/.test(lowerText),
      summary: /summary|objective|about|profile/.test(lowerText),
      experience: /experience|employment|work history/.test(lowerText),
      education: /education|degree|university|college/.test(lowerText),
      skills: /skills|technologies|competencies/.test(lowerText),
      certifications: /certification|certificate|licensed/.test(lowerText),
      projects: /projects|portfolio/.test(lowerText),
    };
  }

  /**
   * Extract keywords from text
   */
  private extractKeywords(text: string): string[] {
    const lowerText = text.toLowerCase();
    const foundKeywords: string[] = [];

    // Check common keywords
    this.commonKeywords.forEach((keyword) => {
      if (lowerText.includes(keyword)) {
        foundKeywords.push(keyword);
      }
    });

    // Check technical keywords
    this.technicalKeywords.forEach((keyword) => {
      if (lowerText.includes(keyword)) {
        foundKeywords.push(keyword);
      }
    });

    return [...new Set(foundKeywords)]; // Remove duplicates
  }

  /**
   * Find missing important keywords
   */
  private findMissingKeywords(foundKeywords: string[]): string[] {
    const importantKeywords = [
      'leadership',
      'project management',
      'problem-solving',
      'communication',
      'team collaboration',
    ];

    return importantKeywords.filter((keyword) => !foundKeywords.includes(keyword));
  }

  /**
   * Analyze formatting
   */
  private analyzeFormatting(text: string): ATSAnalysisResult['formatting'] {
    const issues: string[] = [];
    let score = 100;

    // Check length
    if (text.length < 1000) {
      issues.push('Resume is too short');
      score -= 20;
    } else if (text.length > 5000) {
      issues.push('Resume is too long');
      score -= 10;
    }

    // Check for special characters that might confuse ATS
    if (/[^\x00-\x7F]/.test(text)) {
      issues.push('Contains special characters that may not parse well');
      score -= 10;
    }

    // Check for proper sections
    if (!text.includes('\n\n')) {
      issues.push('Lacks clear section separation');
      score -= 15;
    }

    return {
      score: Math.max(0, score),
      issues,
    };
  }

  /**
   * Analyze content quality
   */
  private analyzeContent(text: string): ATSAnalysisResult['content'] {
    const wordCount = text.split(/\s+/).length;
    const pageCount = Math.ceil(wordCount / 300); // Approx 300 words per page

    let score = 100;

    // Penalize very short or very long resumes
    if (wordCount < 200) {
      score -= 30;
    } else if (wordCount > 1500) {
      score -= 20;
    }

    // Check for action verbs
    const actionVerbs = [
      'led',
      'managed',
      'developed',
      'implemented',
      'designed',
      'improved',
      'achieved',
      'created',
    ];
    const hasActionVerbs = actionVerbs.some((verb) =>
      text.toLowerCase().includes(verb)
    );

    if (!hasActionVerbs) {
      score -= 20;
    }

    return {
      score: Math.max(0, score),
      wordCount,
      pageCount,
    };
  }

  /**
   * Calculate strengths
   */
  private calculateStrengths(
    sections: ATSAnalysisResult['sections'],
    keywords: string[],
    formatting: ATSAnalysisResult['formatting'],
    content: ATSAnalysisResult['content']
  ): string[] {
    const strengths: string[] = [];

    if (sections.summary) strengths.push('Includes professional summary');
    if (sections.skills) strengths.push('Has dedicated skills section');
    if (sections.certifications) strengths.push('Lists relevant certifications');
    if (keywords.length >= 10) strengths.push('Good keyword density');
    if (formatting.score >= 80) strengths.push('Clean, ATS-friendly formatting');
    if (content.wordCount >= 300 && content.wordCount <= 800)
      strengths.push('Appropriate length');

    return strengths;
  }

  /**
   * Calculate weaknesses
   */
  private calculateWeaknesses(
    sections: ATSAnalysisResult['sections'],
    keywords: string[],
    formatting: ATSAnalysisResult['formatting'],
    content: ATSAnalysisResult['content']
  ): string[] {
    const weaknesses: string[] = [];

    if (!sections.summary) weaknesses.push('Missing professional summary');
    if (!sections.experience) weaknesses.push('Missing work experience section');
    if (!sections.skills) weaknesses.push('Missing skills section');
    if (keywords.length < 5) weaknesses.push('Insufficient relevant keywords');
    if (formatting.score < 70) weaknesses.push('Formatting issues detected');
    if (content.wordCount < 200) weaknesses.push('Resume is too brief');
    if (content.wordCount > 1000) weaknesses.push('Resume is too lengthy');

    return weaknesses;
  }

  /**
   * Generate suggestions
   */
  private generateSuggestions(
    sections: ATSAnalysisResult['sections'],
    keywords: string[],
    formatting: ATSAnalysisResult['formatting'],
    _content: ATSAnalysisResult['content']
  ): string[] {
    const suggestions: string[] = [];

    if (!sections.summary) {
      suggestions.push('Add a compelling professional summary at the top');
    }

    if (keywords.length < 10) {
      suggestions.push(
        'Include more industry-relevant keywords from job descriptions'
      );
    }

    if (!sections.projects) {
      suggestions.push('Consider adding a projects section to showcase your work');
    }

    if (formatting.issues.length > 0) {
      suggestions.push('Simplify formatting to improve ATS compatibility');
    }

    suggestions.push('Use action verbs to start bullet points');
    suggestions.push('Quantify achievements with metrics where possible');

    return suggestions;
  }

  /**
   * Calculate overall ATS score
   */
  private calculateATSScore(
    sections: ATSAnalysisResult['sections'],
    keywords: string[],
    formatting: ATSAnalysisResult['formatting'],
    content: ATSAnalysisResult['content']
  ): number {
    let score = 0;

    // Sections score (40 points max)
    const sectionCount = Object.values(sections).filter(Boolean).length;
    score += (sectionCount / 7) * 40;

    // Keywords score (30 points max)
    const keywordScore = Math.min(keywords.length / 15, 1) * 30;
    score += keywordScore;

    // Formatting score (15 points max)
    score += (formatting.score / 100) * 15;

    // Content score (15 points max)
    score += (content.score / 100) * 15;

    return Math.round(Math.min(score, 100));
  }
}

export default new ATSScanner();