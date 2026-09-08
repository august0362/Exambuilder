class ILLMProvider {
  async generate(prompt) {
    throw new Error('generate() chua duoc trien khai');
  }
}

module.exports = { ILLMProvider };
