// Debug script to check card widths
// Run this in browser console

const cards = document.querySelectorAll('.stock-card');
cards.forEach(card => {
    const symbol = card.dataset.symbol;
    const width = card.dataset.width || '1';
    const actualWidth = card.getBoundingClientRect().width;
    console.log(`${symbol} (width:${width}) - Actual: ${actualWidth}px`);
});

// Calculate what 2 single cards should be
const singleCards = Array.from(cards).filter(c => !c.dataset.width || c.dataset.width === '1');
if (singleCards.length >= 2) {
    const total = singleCards[0].getBoundingClientRect().width + singleCards[1].getBoundingClientRect().width;
    console.log(`\nTwo single cards total: ${total}px`);
}
