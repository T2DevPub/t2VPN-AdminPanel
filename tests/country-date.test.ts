import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {countryFlag,countryName,countryLabel,serverLocation} from '../src/lib/country';
import {periodBounds,istTodayStart} from '../src/lib/time-period';

test('country flags and names use ISO two-letter codes',()=>{
 assert.equal(countryFlag('in'),'🇮🇳');
 assert.equal(countryLabel('IN'),'🇮🇳 India (IN)');
 assert.equal(countryName('US'),'United States');
 assert.equal(countryLabel('??'),'🌐 Unknown country');
 assert.equal(serverLocation('United States','Iowa','US'),'United States · Iowa');
});
test('IST today starts at midnight regardless of server UTC time',()=>{
 const now=new Date('2026-11-17T18:50:00Z'); // 18 Nov, 00:20 IST
 assert.equal(istTodayStart(now).toISOString(),'2026-11-17T18:30:00.000Z');
 assert.equal(periodBounds('today',now).start.toISOString(),'2026-11-17T18:30:00.000Z');
 assert.equal(periodBounds('yesterday',now).end.toISOString(),'2026-11-17T18:30:00.000Z');
});
