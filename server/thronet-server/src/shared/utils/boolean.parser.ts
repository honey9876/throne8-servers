// utils/booleanParser.js
export class BooleanQueryParser {
  parse(query: String) {
    if (!query ) {
      return [];
    }

    // Simple implementation - splits by AND/OR operators
    // This is a basic version - extend as needed
    const normalizedQuery = query.trim().toLowerCase();
    
    // Split by AND first (higher precedence)
    const andGroups = normalizedQuery.split(/\s+and\s+/i);
    
    const result = andGroups.map(andGroup => {
      // Split each AND group by OR
      const orTerms = andGroup.split(/\s+or\s+/i);
      return orTerms.map(term => term.trim().replace(/['"]/g, ''));
    });

    return result;
  }

  // Alternative: Parse to MongoDB query format
  parseToMongoQuery(query: string, searchFields = ['title', 'description.summary', 'skills.name']) {
    const parsed = this.parse(query);
    
    if (parsed.length === 0) {
      return {};
    }

    const andConditions = parsed.map(orGroup => {
      const orConditions = orGroup.map(term => ({
        $or: searchFields.map(field => ({
          [field]: new RegExp(term, 'i')
        }))
      }));

      return orConditions.length === 1 ? orConditions[0] : { $or: orConditions };
    });

    return andConditions.length === 1 ? andConditions[0] : { $and: andConditions };
  }
}

export const booleanParser = new BooleanQueryParser();