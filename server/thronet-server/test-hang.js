console.log('A');
require('tsconfig-paths/register');
require('ts-node').register({ transpileOnly: true });
console.log('B');
require('./src/StudyGroup/controllers/index.ts');
console.log('C - LOADED SUCCESSFULLY');
