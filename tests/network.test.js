const { lanAddresses } = require('../backend/network');

test('TC-NET-01: chi lay IPv4 LAN that, uu tien 192.168, bo loopback/ao/APIPA/IPv6', () => {
  const ifaces = {
    'Wi-Fi': [{ family: 'IPv4', address: '10.0.0.5', internal: false }, { family: 'IPv6', address: 'fe80::1', internal: false }],
    Ethernet: [{ family: 4, address: '192.168.1.20', internal: false }],
    'vEthernet (WSL)': [{ family: 'IPv4', address: '172.20.0.1', internal: false }],
    'Loopback Pseudo-Interface 1': [{ family: 'IPv4', address: '127.0.0.1', internal: true }],
    Other: [{ family: 'IPv4', address: '169.254.3.3', internal: false }, { family: 'IPv4', address: '8.8.8.8', internal: false }]
  };
  expect(lanAddresses(ifaces)).toEqual(['192.168.1.20', '10.0.0.5']);
  expect(lanAddresses({})).toEqual([]);
});
