import {readFileSync,writeFileSync} from 'node:fs';
const schema=readFileSync('prisma/schema.prisma','utf8').replace('provider = "sqlite"','provider = "postgresql"');
writeFileSync('prisma/postgres/schema.prisma',schema);
console.log('PostgreSQL schema synchronized. Existing migration files were preserved. Generate the PostgreSQL Prisma client and deploy incremental migrations using the migration role.');
