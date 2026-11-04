// Os testes de integração usam um banco separado (TEST_DATABASE_URL), nunca o de desenvolvimento.
import "dotenv/config";

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) throw new Error("Defina TEST_DATABASE_URL para rodar os testes.");
if (testUrl === process.env.DATABASE_URL) throw new Error("TEST_DATABASE_URL não pode ser o banco de desenvolvimento.");
process.env.DATABASE_URL = testUrl;
