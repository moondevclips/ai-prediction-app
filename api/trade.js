// --- Binance Trading Backend for Vercel Serverless ---

const Binance = require('node-binance-api');
const cors = require('cors');

// Initialize CORS middleware
const corsMiddleware = cors({
  origin: '*', // Allow all origins
});

// Helper to run middleware
const runMiddleware = (req, res, fn) => {
  return new Promise((resolve, reject) => {
    fn(req, res, (result) => {
      if (result instanceof Error) {
        return reject(result);
      }
      return resolve(result);
    });
  });
};

export default async function handler(req, res) {
  // Run CORS middleware
  await runMiddleware(req, res, corsMiddleware);

  // Only allow POST requests
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  // --- Environment Variable Check ---
  if (!process.env.BINANCE_API_KEY || !process.env.BINANCE_SECRET_KEY) {
      console.error("FATAL ERROR: Binance API keys are not set in Vercel environment variables.");
      return res.status(500).json({ message: "Server configuration error: API keys not set." });
  }

  // --- Initialize Binance Client ---
  const binance = new Binance().options({
    APIKEY: process.env.BINANCE_API_KEY,
    APISECRET: process.env.BINANCE_SECRET_KEY,
    test: true // Use the Binance Futures Testnet
  });

  console.log('Received trade request:', req.body);

  try {
      if (!req.body.symbol || !req.body.notional || !req.body.side) {
          return res.status(400).json({ message: 'Missing required trade parameters.' });
      }

      const symbol = req.body.symbol.replace('/', '') + 'USDT';
      const notionalValue = parseFloat(req.body.notional);
      const side = req.body.side.toUpperCase();
      
      const ticker = await binance.futuresPrices(symbol);
      const currentPrice = parseFloat(ticker[symbol]);

      if (!currentPrice) {
          throw new Error(`Could not fetch price for ${symbol}`);
      }
      
      const exchangeInfo = await binance.futuresExchangeInfo();
      const symbolInfo = exchangeInfo.symbols.find(s => s.symbol === symbol);
      const stepSize = parseFloat(symbolInfo.filters.find(f => f.filterType === 'LOT_SIZE').stepSize);
      
      let quantity = notionalValue / currentPrice;
      quantity = binance.roundStep(quantity, stepSize);

      console.log(`Calculated quantity: ${quantity} for symbol ${symbol}`);
      
      let orderResult;
      if (side === 'BUY') {
          orderResult = await binance.futuresMarketBuy(symbol, quantity);
      } else {
          orderResult = await binance.futuresMarketSell(symbol, quantity);
      }

      if (orderResult.code) {
           throw new Error(`Market order failed: ${orderResult.msg}`);
      }
      
      console.log('Successfully placed market order with Binance:', orderResult);
      res.status(200).json(orderResult);

  } catch (error) {
      const errorMessage = error.body ? JSON.parse(error.body).msg : error.message;
      console.error('Error executing trade with Binance:', errorMessage);
      res.status(500).json({ message: errorMessage });
  }
}
