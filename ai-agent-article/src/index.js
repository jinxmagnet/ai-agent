import 'dotenv/config';
import { runOnce, startSchedule } from './orchestrator/runPipeline.js';
import { logError, logInfo } from './services/logger.js';

const args = process.argv.slice(2);

if (args.includes('--schedule')) {
  startSchedule();
  process.on('SIGINT', () => {
    logInfo('定时任务已停止');
    process.exit(0);
  });
} else {
  runOnce().catch((error) => {
    logError('运行失败', { error: error.message });
    process.exitCode = 1;
  });
}