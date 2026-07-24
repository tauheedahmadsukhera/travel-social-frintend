const fs = require('fs');
let src = fs.readFileSync('app/components/CommentSection.tsx', 'utf8');

// Fix 1: The renderComment function is missing the `);` and closing `}` before `};`
// Current broken end:
//       </View>
//   };
// Should be:
//       </View>
//     );
//   };

src = src.replace(
    '      </View>\n  };',
    '      </View>\n    );\n  };'
);

// Fix 2: Fix TypeScript type issue with Array.isArray value
src = src.replace(
    '        } else if (Array.isArray(value)) {\n          heartCount += value.length;\n          if (value.includes(currentUserId)) userLiked = true;\n        }',
    '        } else if (Array.isArray(value)) {\n          heartCount += (value as string[]).length;\n          if ((value as string[]).includes(currentUserId)) userLiked = true;\n        }'
);

// Fix 3: Add heartBtn and heartCount styles before the styles closing bracket
// Find the last `});` which closes StyleSheet.create
const lastClose = src.lastIndexOf('});');
if (lastClose !== -1) {
    const heartStyles = `  heartBtn: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 4,
    paddingLeft: 8,
    minWidth: 28,
  },
  heartCount: {
    fontSize: 11,
    color: '#aaa',
    marginTop: 2,
    textAlign: 'center',
  },
`;
    src = src.slice(0, lastClose) + heartStyles + src.slice(lastClose);
    console.log('Added heart styles');
}

fs.writeFileSync('app/components/CommentSection.tsx', src, 'utf8');
console.log('Done! Lines:', src.split('\n').length);

// Quick syntax check
try {
    const lines = src.split('\n');
    let opens = 0, closes = 0;
    lines.forEach(l => {
        opens += (l.match(/\{/g) || []).length;
        closes += (l.match(/\}/g) || []).length;
    });
    console.log('Brace balance (approx):', opens - closes, '(0 is perfect)');
} catch (e) { }
