var Log = require('../lib/log');

Log
  .open()
  .tap((log) => {
    console.log(`Log ${log} ...`);

    log.write('hello\n');
    log.error('world\n');

    log.on('end', () => {
      console.log(`Log ${log.id} ended.`);
      process.exit();
    });
  })
  .delay(2 * 1000)
  .tap((log) => {
    log.end({ a : 'b' });
  });
