import { deserializeBoc, parseBoc, serializeBoc } from "./serialization";
import fs from 'fs';

const wallets: string[] = [
    'B5EE9C72410101010044000084FF0020DDA4F260810200D71820D70B1FED44D0D31FD3FFD15112BAF2A122F901541044F910F2A2F80001D31F3120D74A96D307D402FB00DED1A4C8CB1FCBFFC9ED5441FDF089',
    'B5EE9C724101010100530000A2FF0020DD2082014C97BA9730ED44D0D70B1FE0A4F260810200D71820D70B1FED44D0D31FD3FFD15112BAF2A122F901541044F910F2A2F80001D31F3120D74A96D307D402FB00DED1A4C8CB1FCBFFC9ED54D0E2786F',
    'B5EE9C7241010101005F0000BAFF0020DD2082014C97BA218201339CBAB19C71B0ED44D0D31FD70BFFE304E0A4F260810200D71820D70B1FED44D0D31FD3FFD15112BAF2A122F901541044F910F2A2F80001D31F3120D74A96D307D402FB00DED1A4C8CB1FCBFFC9ED54B5B86E42',
    'B5EE9C724101010100570000AAFF0020DD2082014C97BA9730ED44D0D70B1FE0A4F2608308D71820D31FD31F01F823BBF263ED44D0D31FD3FFD15131BAF2A103F901541042F910F2A2F800029320D74A96D307D402FB00E8D1A4C8CB1FCBFFC9ED54A1370BB6',
    'B5EE9C724101010100630000C2FF0020DD2082014C97BA218201339CBAB19C71B0ED44D0D31FD70BFFE304E0A4F2608308D71820D31FD31F01F823BBF263ED44D0D31FD3FFD15131BAF2A103F901541042F910F2A2F800029320D74A96D307D402FB00E8D1A4C8CB1FCBFFC9ED54044CD7A1',
    'B5EE9C724101010100620000C0FF0020DD2082014C97BA9730ED44D0D70B1FE0A4F2608308D71820D31FD31FD31FF82313BBF263ED44D0D31FD31FD3FFD15132BAF2A15144BAF2A204F901541055F910F2A3F8009320D74A96D307D402FB00E8D101A4C8CB1FCB1FCBFFC9ED543FBE6EE0',
    'B5EE9C724101010100710000DEFF0020DD2082014C97BA218201339CBAB19F71B0ED44D0D31FD31F31D70BFFE304E0A4F2608308D71820D31FD31FD31FF82313BBF263ED44D0D31FD31FD3FFD15132BAF2A15144BAF2A204F901541055F910F2A3F8009320D74A96D307D402FB00E8D101A4C8CB1FCB1FCBFFC9ED5410BD6DAD'
];

describe('boc', () => {
    it('should boc', () => {
        let b1 = deserializeBoc(Buffer.from('te6cckEBAQEABwAACQHW80Vgb11ZoQ==', 'base64'));
        let b2 = deserializeBoc(Buffer.from('te6cckEBAgEADgABCQHW80VgAQAHdWtbOOjL63Q=', 'base64'));
        let b3 = deserializeBoc(Buffer.from('te6ccsEBAgEADgAIDgEJAdbzRWABAAd1a1s4yDmZeQ==', 'base64'));

        let r1 = serializeBoc(b1[0], { idx: false, crc32c: true }).toString('base64');
        console.warn(r1);
        let r2 = serializeBoc(b2[0], { idx: true, crc32c: true }).toString('base64');
        console.warn(r2);
        let r3 = serializeBoc(b3[0], { idx: true, crc32c: true }).toString('base64');
        console.warn(r3);
    });

    it('should parse wallet code', () => {
        for (let w of wallets) {
            deserializeBoc(Buffer.from(w, 'hex'));
        }
    });

    it('should parse largeBoc.txt', () => {
        let boc = Buffer.from(fs.readFileSync(__dirname + '/__testdata__/largeBoc.txt', 'utf8'), 'base64');
        // console.warn(parseBoc(boc));
        let c = deserializeBoc(boc)[0];
        serializeBoc(c, { idx: false, crc32c: true });
    });
    it('should parse manyCells.txt', () => {
        let boc = Buffer.from(fs.readFileSync(__dirname + '/__testdata__/manyCells.txt', 'utf8'), 'base64');
        // console.warn(parseBoc(boc));
        let c = deserializeBoc(boc)[0];
        serializeBoc(c, { idx: false, crc32c: true });
    });
    it('should parse veryLarge.boc', () => {
        let boc = fs.readFileSync(__dirname + '/__testdata__/veryLarge.boc');
        // console.warn(parseBoc(boc));
        let c = deserializeBoc(boc)[0];
        serializeBoc(c, { idx: false, crc32c: true });
    });
    it('should parse accountState.txt', () => {
        let boc = Buffer.from(fs.readFileSync(__dirname + '/__testdata__/accountState.txt', 'utf8'), 'base64');
        // console.warn(parseBoc(boc));
        let c = deserializeBoc(boc)[0];
        serializeBoc(c, { idx: false, crc32c: true });
    });
});