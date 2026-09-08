const { ILLMProvider } = require('./ILLMProvider');

// node-llama-cpp la goi thuan ESM; backend con lai dung CommonJS nen phai
// nap bang dynamic import() ngay trong ham async thay vi require() thong
// thuong. Nap 1 model (.gguf) ton kha nhieu thoi gian/RAM nen cache lai
// theo filePath de khong phai nap lai moi lan sinh de.
const sessionCache = new Map();

async function getOrCreateSession(filePath) {
  if (sessionCache.has(filePath)) {
    return sessionCache.get(filePath);
  }

  const { getLlama, LlamaChatSession } = await import('node-llama-cpp');
  const llama = await getLlama();
  const model = await llama.loadModel({ modelPath: filePath });
  const context = await model.createContext();
  const session = new LlamaChatSession({ contextSequence: context.getSequence() });

  sessionCache.set(filePath, session);
  return session;
}

class LocalGgufProvider extends ILLMProvider {
  constructor(filePath) {
    super();
    this.filePath = filePath;
  }

  async generate(prompt) {
    let session;
    try {
      session = await getOrCreateSession(this.filePath);
    } catch (err) {
      throw new Error(`Model local: khong the nap file .gguf (${err.message})`);
    }

    try {
      return await session.prompt(prompt);
    } catch (err) {
      throw new Error(`Model local: loi khi sinh noi dung (${err.message})`);
    }
  }
}

module.exports = { LocalGgufProvider };
