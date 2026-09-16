// 手动迁移入口：npm run db:migrate（package.json 里配 node --experimental-strip-types）
// 注意：正常流程不需要手动跑——每个 API route 入口都会调 migrate()（幂等）。
// 本脚本主要给 smoke 测试和排障用。
import { migrate } from './index';

migrate();
console.log('Migration complete.');
