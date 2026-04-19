const { execSync } = require('child_process');
try {
    const output = execSync('netstat -ano').toString();
    const lines = output.split('\n');
    const port3000 = lines.find(line => line.includes(':3000'));
    if (port3000) {
        console.log('Found process using port 3000:');
        console.log(port3000.trim());
        const parts = port3000.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        console.log('PID: ' + pid);
        const name = execSync(`tasklist /fi "pid eq ${pid}"`).toString();
        console.log(name);
    } else {
        console.log('No process found using port 3000 in netstat output.');
    }
} catch (err) {
    console.error(err);
}
