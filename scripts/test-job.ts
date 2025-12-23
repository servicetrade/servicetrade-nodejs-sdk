import ServicetradeClient from '../src/index';

// Fill in your credentials here
const CLIENT_ID = '72f396bab078833d914e710ba81c883e';
const CLIENT_SECRET = '347c015ed469aed73a9f015d2c7427f6e$1ec$c78f79f5%750132c16&0ca05cd';


// The job ID you want to fetch
const JOB_ID = 12345;

async function main() {
    const client = new ServicetradeClient({
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
    });

    try {
        console.log('Logging in...');
        await client.login();
        console.log('Logged in successfully!');

        const job = await client.get(`/job`);
        console.log('Job data:', JSON.stringify(job, null, 2));
    } catch (error) {
        console.error('Error:', error);
    }
}

main();

