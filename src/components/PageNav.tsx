import { useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { OutlineItem } from '../lib/outline';
import PageThumbnail from './PageThumbnail';

interface Props {
  pdf: PDFDocumentProxy;
  outline: OutlineItem[];
  currentPage: number;
  onNavigate: (page: number) => void;
}

function OutlineList({ items, onNavigate }: { items: OutlineItem[]; onNavigate: (page: number) => void }) {
  return (
    <ul className="outline-list">
      {items.map((item, i) => (
        <li key={i}>
          <button
            className="outline-item"
            disabled={item.page === null}
            onClick={() => item.page && onNavigate(item.page)}
          >
            {item.title}
          </button>
          {item.items.length > 0 && <OutlineList items={item.items} onNavigate={onNavigate} />}
        </li>
      ))}
    </ul>
  );
}

export default function PageNav({ pdf, outline, currentPage, onNavigate }: Props) {
  const [tab, setTab] = useState<'pages' | 'outline'>(outline.length > 0 ? 'outline' : 'pages');
  const pageNumbers = Array.from({ length: pdf.numPages }, (_, i) => i + 1);

  return (
    <nav className="page-nav">
      <div className="page-nav__tabs">
        <button
          className={`chip ${tab === 'pages' ? 'chip--active' : ''}`}
          onClick={() => setTab('pages')}
        >
          Pages
        </button>
        {outline.length > 0 && (
          <button
            className={`chip ${tab === 'outline' ? 'chip--active' : ''}`}
            onClick={() => setTab('outline')}
          >
            Outline
          </button>
        )}
      </div>

      <div className="page-nav__body">
        {tab === 'pages' ? (
          <div className="page-thumb-grid">
            {pageNumbers.map((n) => (
              <PageThumbnail
                key={n}
                pdf={pdf}
                pageNumber={n}
                active={n === currentPage}
                onClick={() => onNavigate(n)}
              />
            ))}
          </div>
        ) : (
          <OutlineList items={outline} onNavigate={onNavigate} />
        )}
      </div>
    </nav>
  );
}
