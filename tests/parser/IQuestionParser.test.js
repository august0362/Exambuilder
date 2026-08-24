const { IQuestionParser } = require('../../backend/parser/IQuestionParser.js');
const { TextPromptParser } = require('../../backend/parser/TextPromptParser.js');
const { FileUploadParser } = require('../../backend/parser/FileUploadParser.js');

/**
 * IQuestionParser la "interface" (lop cha truu tuong) theo nguyen ly
 * Open/Closed: cac parser cu the (TextPromptParser, FileUploadParser) ke
 * thua va override parse(), cho phep them dinh dang moi ma khong sua doi
 * logic da co.
 */
describe('IQuestionParser', () => {
  test('TC-IP-01: goi parse() truc tiep tren lop co so nem loi "chua duoc trien khai"', () => {
    const base = new IQuestionParser();
    expect(() => base.parse('bat ky')).toThrow('parse() chua duoc trien khai');
  });

  test('TC-IP-02: cac parser cu the deu ke thua tu IQuestionParser (Open/Closed Principle)', () => {
    expect(new TextPromptParser()).toBeInstanceOf(IQuestionParser);
    expect(new FileUploadParser()).toBeInstanceOf(IQuestionParser);
  });
});
