import express, { Express, Request, Response } from "express";
import dotenv from "dotenv";
import redis from "redis";
import { RowDataPacket, createConnection } from "mysql2";
dotenv.config();

const connection = createConnection({
	host: process.env.DB_HOST,
	port: +process.env.DB_PORT!,
	user: process.env.DB_USER,
	password: process.env.DB_PASSWORD,
	database: process.env.DB_NAME,
});

const client = redis.createClient({
	password: process.env.REDIS_PASSWORD,
	socket: {
		host: process.env.REDIS_HOST,
		port: parseInt(process.env.REDIS_PORT || "6379", 10),
	},
});

//-- main Class
class URLShortener {
	constructor() {}

	private generateShortCode(): string {
		const characters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
		let shortCode = "";

		for (let i = 0; i < 10; i++) {
			const randomIndex = Math.floor(Math.random() * characters.length);
			shortCode += characters[randomIndex];
		}

		return shortCode;
	}

	public async shortenURL(longURL: string): Promise<string> {
		if (!longURL.startsWith("http://") && !longURL.startsWith("https://")) {
			longURL = "http://" + longURL;
		}

		const shortCode = this.generateShortCode();
		await client.set(shortCode, longURL);
		connection.query(`INSERT INTO urlShortener (shortCode, longUrl) VALUES ('${shortCode}', '${longURL}');`);

		return `http://short.url/${shortCode}`;
	}

	public async expandURL(shortCode: string, res: Response) {
		const longURL = await client.get(shortCode);
		if (longURL === null) {
			const sql = `SELECT longUrl
			FROM urlShortener
			WHERE shortCode = ?`;
			const filter = [shortCode];
			const result = connection.execute<RowDataPacket[]>(sql, filter, function (err, results) {
				res.send(JSON.stringify(results[0].longUrl));
			});
		} else {
			console.log("get from cache");
			res.send(longURL || null);
		}
	}
}

const startDbs = async () => {
	connection.connect();

	connection.query("SELECT 1 + 1 AS solution");

	connection.query(
		`CREATE TABLE IF NOT EXISTS urlShortener (
		id INT AUTO_INCREMENT PRIMARY KEY,
		shortCode VARCHAR(10) NOT NULL UNIQUE,
		longUrl TEXT NOT NULL
	  );
	  `
	);

	await client.connect();
};

const PORT = process.env.PORT || 7000;
const app: Express = express();
app.use(express.json());

const urlShorneter = new URLShortener();

app.get("/", async (req: Request, res: Response) => {
	const { code } = req.body;
	await urlShorneter.expandURL(code, res);
});

app.post("/", async (req: Request, res: Response) => {
	const { url } = req.body;
	const short = await urlShorneter.shortenURL(url);
	res.send(short);
});

const start = async () => {
	try {
		await startDbs();
		app.listen(PORT, () => {
			console.log(`Server is connected to redis and is listening on port ${PORT}`);
		});
	} catch (error) {
		console.log(error);
	}
};

start();
