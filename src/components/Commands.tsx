import { useState } from 'react';
import { Search } from 'lucide-react';
import { t, useLanguage } from '../lib/i18n';
import { Dialog } from './Dialog';

export interface Command { label: string; keys: string[]; run: () => void }
export function Commands({ commands, destinations, onClose }: { commands: Command[]; destinations: Command[]; onClose: () => void }) {
  useLanguage();
  const [query, setQuery] = useState('');
  const [jump, setJump] = useState(false);
  const [active, setActive] = useState(0);
  const jumpLabel = t('Jump to…');
  const options = (jump ? destinations : [{ label: jumpLabel, keys: ['Alt', 'J'], run: () => { setJump(true); setQuery(''); setActive(0); } }, ...commands]).filter(command => command.label.toLowerCase().includes(query.toLowerCase()));
  const selected = Math.min(active, Math.max(0, options.length - 1));
  const execute = (index: number) => { const command = options[index]; if (command) { if (command.label !== jumpLabel) onClose(); command.run(); } };
  return <Dialog title={t(jump ? 'Jump to a page' : 'Search and commands')} onClose={onClose} className="command-dialog"><div className="command-search"><Search size={16} /><input autoFocus role="combobox" aria-label={t(jump ? 'Jump to a page' : 'Search commands')} aria-autocomplete="list" aria-controls="command-list" aria-expanded="true" aria-activedescendant={options.length ? `command-${selected}` : undefined} value={query} onChange={event => { setQuery(event.target.value); setActive(0); }} placeholder={t(jump ? 'Jump to a page' : 'Search commands…')} onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setActive(Math.max(0, Math.min(options.length - 1, selected + (event.key === 'ArrowDown' ? 1 : -1)))); } else if (event.key === 'Enter') { event.preventDefault(); execute(selected); } }} /></div><div id="command-list" role="listbox" aria-label={t(jump ? 'Pages' : 'Commands')}>{options.map((command, index) => <div role="option" key={command.label} id={`command-${index}`} aria-selected={selected === index} className={`command-option ${selected === index ? 'selected' : ''}`} onMouseMove={() => setActive(index)} onMouseDown={event => event.preventDefault()} onClick={() => execute(index)}><span>{command.label}</span><span className="key-group" aria-hidden="true">{command.keys.map(key => <kbd key={key}>{key}</kbd>)}</span></div>)}{!options.length && <p className="muted">{t(jump ? 'No matching pages' : 'No matching commands')}</p>}</div></Dialog>;
}
