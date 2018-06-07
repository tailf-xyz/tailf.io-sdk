var Log = require('../lib/log');

Log
  .open()
  .tap((log) => {
    console.log(`Log ${log} ...`);

    log.write('hello\n');
    log.error('world\n');

    log
      .readOnEnd()
      .then((rec) => {
        console.log(`Log ${log.id} ended.`);
        console.dir(rec);
        process.exit();
      })
  })
  .delay(2 * 1000)
  .tap((log) => {
    log.end(undefined, { a : 'b' });
  });
