const { nextUpdateNumber, labelMessage, chokMapCommitted } = require('../publish-update');

const listed = (message) => `"${message}" (5 hours ago by avraham-sason)`;

describe('nextUpdateNumber', () => {
  it('starts at 1 on a version nothing was published for', () => {
    expect(nextUpdateNumber([])).toBe(1);
  });

  it('counts the updates published before numbering began', () => {
    expect(nextUpdateNumber(['a', 'b', 'c', 'd'].map(listed))).toBe(5);
  });

  it('follows the highest number once updates carry one', () => {
    expect(
      nextUpdateNumber([listed('1.0.16-6: fix'), listed('1.0.16-5: siddur'), ...['a', 'b', 'c', 'd'].map(listed)]),
    ).toBe(7);
  });

  it('does not skip a number for a republished update, which keeps an older number or none', () => {
    expect(
      nextUpdateNumber([listed('Republish "1.0.16-5: siddur"'), listed('1.0.16-6: fix'), listed('1.0.16-5: siddur')]),
    ).toBe(7);
  });

  it('reads the number whether or not the CLI wraps the message in quotes', () => {
    expect(nextUpdateNumber(['1.0.17-3: raw message'])).toBe(4);
  });

  it('never reuses the number of a deleted update below the highest', () => {
    expect(nextUpdateNumber([listed('1.0.16-8: last')])).toBe(9);
  });
});

describe('labelMessage', () => {
  it('puts the label before a --message value and keeps every other flag', () => {
    expect(labelMessage(['--message', 'Siddur fixes', '--non-interactive'], '1.0.16-5')).toEqual([
      '--message',
      '1.0.16-5: Siddur fixes',
      '--non-interactive',
    ]);
  });

  it('labels the -m short flag', () => {
    expect(labelMessage(['-m', 'fix'], '1.0.16-5')).toEqual(['-m', '1.0.16-5: fix']);
  });

  it('labels the --message= form', () => {
    expect(labelMessage(['--message=a=b'], '1.0.16-5')).toEqual(['--message=1.0.16-5: a=b']);
  });

  it('refuses to publish without a message', () => {
    expect(() => labelMessage(['--non-interactive'], '1.0.16-5')).toThrow('--message');
    expect(() => labelMessage(['--message'], '1.0.16-5')).toThrow('--message');
  });
});

describe('chokMapCommitted', () => {
  it('passes when git reports the generated Chok map unchanged from HEAD', () => {
    const run = jest.fn(() => ({ status: 0 }));
    expect(chokMapCommitted(run)).toBe(true);
    expect(run).toHaveBeenCalledWith('git', ['diff', '--quiet', 'HEAD', '--', 'src/data/chokAssets.generated.ts'], {
      encoding: 'utf8',
    });
  });

  it('refuses when the map differs, and when git cannot answer', () => {
    expect(chokMapCommitted(() => ({ status: 1 }))).toBe(false);
    expect(chokMapCommitted(() => ({ status: 128 }))).toBe(false);
    expect(chokMapCommitted(() => ({ status: null }))).toBe(false);
  });
});
