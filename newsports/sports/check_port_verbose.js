const net = require('net');
const server = net.createServer();
console.log('Starting port check on 3000...');
server.once('error', (err) => {
  console.log('Error code: ' + err.code);
  process.exit(1);
});
server.once('listening', () => {
    console.log('Port 3000 is FREE');
    server.close();
    process.exit(0);
});
console.log('Trying to listen on 3000...');
server.listen(3000);
