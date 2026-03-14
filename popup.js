const wordsArea = document.getElementById('words');
const saveBtn = document.getElementById('saveBtn');
const checkBtn = document.getElementById('checkBtn');
const msg = document.getElementById('msg');
const resultsDiv = document.getElementById('results');

const KEY = 'wordFinder_list';

function setMessage(text, isError = false) {
  msg.textContent = text;
  msg.style.color = isError ? '#cc2c2c' : '#2274A5';
}

function parseLines(value) {
  return value
    .split('\n')
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}

function saveWords() {
  const words = parseLines(wordsArea.value);
  chrome.storage.local.set({ [KEY]: words }, () => {
    setMessage(`Saved ${words.length} item${words.length === 1 ? '' : 's'}.`);
  });
}

function loadWords() {
  chrome.storage.local.get([KEY], (data) => {
    const list = data[KEY] || [];
    wordsArea.value = list.join('\n');
  });
}

async function checkCurrentPage() {
  const words = parseLines(wordsArea.value);
  if (!words.length) {
    setMessage('Please add at least one word or phrase and save first.', true);
    return;
  }

  setMessage('Checking page...', false);
  resultsDiv.innerHTML = '';

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    setMessage('No active tab found.', true);
    return;
  }

  try {
    const injected = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (wordsArray) => {
        function normalize(str) {
          return str
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim()
            .replace(/[^a-z0-9 ]+/g, '');
        }
        const pageText = normalize(document.body.innerText || '');
        const pageTextNoSpaces = pageText.replace(/\s+/g, '');

        return wordsArray.map((w) => {
          const phrase = normalize(w);
          const phraseNoSpaces = phrase.replace(/\s+/g, '');
          const found = phrase && (pageText.includes(phrase) || pageTextNoSpaces.includes(phraseNoSpaces));
          return {
            word: w,
            found,
          };
        });
      },
      args: [words],
    });

    if (!injected?.[0]?.result) {
      setMessage('Could not inspect this page. Try reloading.', true);
      return;
    }

    const results = injected[0].result;
    resultsDiv.innerHTML = '';
    for (const item of results) {
      const div = document.createElement('div');
      div.className = `result-item ${item.found ? 'result-good' : 'result-bad'}`;
      div.innerHTML = `<span class="dot">${item.found ? '✓' : '✕'}</span><span>${item.word}</span>`;
      
      if (item.found) {
        div.style.cursor = 'pointer';
        div.addEventListener('click', () => scrollToWord(item.word, tab.id));
      }
      
      resultsDiv.appendChild(div);
    }
    setMessage('Check complete.');
  } catch (error) {
    console.error(error);
    setMessage('Error checking page. Make sure the website is not restricted by extension policies.', true);
  }
}

async function scrollToWord(word, tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (searchWord) => {
      function normalize(str) {
        return str
          .toLowerCase()
          .replace(/\s+/g, ' ')
          .trim()
          .replace(/[^a-z0-9 ]+/g, '');
      }

      const normalizedSearch = normalize(searchWord);
      const searchNoSpaces = normalizedSearch.replace(/\s+/g, '');
      const treeWalker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        null
      );

      let node;
      while ((node = treeWalker.nextNode())) {
        const normalizedText = normalize(node.textContent);
        const textNoSpaces = normalizedText.replace(/\s+/g, '');
        
        if (normalizedText.includes(normalizedSearch) || textNoSpaces.includes(searchNoSpaces)) {
          const span = document.createElement('span');
          span.className = 'word-finder-highlight';
          span.style.backgroundColor = 'yellow';
          span.style.color = 'black';
          span.style.boxShadow = '0 0 5px gold';
          span.style.padding = '2px';
          span.style.fontWeight = 'bold';
          span.textContent = node.textContent;
          
          node.parentNode.replaceChild(span, node);
          span.scrollIntoView({ behavior: 'smooth', block: 'center' });
          
          setTimeout(() => {
            if (span.parentNode) {
              const textNode = document.createTextNode(span.textContent);
              span.parentNode.replaceChild(textNode, span);
            }
          }, 3000);
          
          return;
        }
      }
    },
    args: [word],
  });
}

saveBtn.addEventListener('click', saveWords);
checkBtn.addEventListener('click', checkCurrentPage);
loadWords();
