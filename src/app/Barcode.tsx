const CODE39: Record<string, string> = { '0':'nnnwwnwnn','1':'wnnwnnnnw','2':'nnwwnnnnw','3':'wnwwnnnnn','4':'nnnwwnnnw','5':'wnnwwnnnn','6':'nnwwwnnnn','7':'nnnwnnwnw','8':'wnnwnnwnn','9':'nnwwnnwnn','A':'wnnnnwnnw','B':'nnwnnwnnw','C':'wnwnnwnnn','D':'nnnnwwnnw','E':'wnnnwwnnn','F':'nnwnwwnnn','G':'nnnnnwwnw','H':'wnnnnwwnn','I':'nnwnnwwnn','J':'nnnnwwwnn','K':'wnnnnnnww','L':'nnwnnnnww','M':'wnwnnnnwn','N':'nnnnwnnww','O':'wnnnwnnwn','P':'nnwnwnnwn','Q':'nnnnnnwww','R':'wnnnnnwwn','S':'nnwnnnwwn','T':'nnnnwnwwn','U':'wwnnnnnnw','V':'nwwnnnnnw','W':'wwwnnnnnn','X':'nwnnwnnnw','Y':'wwnnwnnnn','Z':'nwwnwnnnn','-':'nwnnnnwnw',' ':'nwnnwnwnn','.':'wwnnnnwnn','$':'nwnwnwnnn','/':'nwnwnnnwn','+':'nwnnnwnwn','%':'nnnwnwnwn','*':'nwnnwnwnn' }

export function Barcode({ value, className = 'receipt-barcode', label }: { value: string; className?: string; label?: string }) {
  const text = `*${value.toUpperCase()}*`
  let cursor = 0
  const bars: Array<{ x: number; width: number }> = []
  for (const character of text) {
    const pattern = CODE39[character] ?? CODE39['-']
    for (let index = 0; index < pattern.length; index += 1) {
      const width = pattern[index] === 'w' ? 3 : 1
      if (index % 2 === 0) bars.push({ x: cursor, width })
      cursor += width + 1
    }
    cursor += 1
  }
  return <svg className={className} role="img" aria-label={label ?? `باركود ${value}`} viewBox={`0 0 ${cursor} 42`}><title>{value}</title>{bars.map((bar, index) => <rect key={index} x={bar.x} y="0" width={bar.width} height="42" fill="#000" />)}</svg>
}
