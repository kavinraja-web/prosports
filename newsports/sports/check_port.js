const net = require('net');
const server = net.createServer();
server.once('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log('Port 3000 is in use');
  } else {
    console.log('Error: ' + err.code);
  }
  process.exit(1);
});
server.once('listening', () => {
  console.log('Port 3000 is free');
  server.close();
  process.exit(0);
});
server.listen(3000);
