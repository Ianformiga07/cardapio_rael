# 🔥 Guia de Configuração — Firebase + Pizzaria RA

## Visão Geral da Arquitetura

```
Frontend (Netlify)          Backend (Firebase)
─────────────────           ──────────────────
index.html                  Cloud Firestore
  └─ script.js                └─ /produtos
  └─ js/firebase.js           └─ /pedidos
  └─ js/produtos.js           └─ /usuarios
  └─ js/pedidos.js          Firebase Auth
  └─ js/script-firebase-patch.js
admin.html
  └─ js/admin.js
  └─ js/auth.js
  └─ js/relatorios.js
```

---

## Passo 1 — Criar Projeto Firebase

1. Acesse https://console.firebase.google.com
2. Clique em **"Adicionar projeto"**
3. Nome sugerido: `pizzaria-ra`
4. Google Analytics: opcional
5. Clique em **"Criar projeto"**

---

## Passo 2 — Ativar Firestore

1. No menu lateral: **Firestore Database → Criar banco de dados**
2. Selecione **"Iniciar no modo de produção"**
3. Escolha região: `southamerica-east1` (São Paulo — menor latência)
4. Confirme

---

## Passo 3 — Ativar Authentication

1. Menu lateral: **Authentication → Começar**
2. Aba **"Sign-in method"** → Habilitar **E-mail/senha**
3. Confirme

---

## Passo 4 — Criar o usuário Admin

### 4a. Criar conta no Authentication
1. **Authentication → Users → Adicionar usuário**
2. E-mail: `admin@pizzaria-ra.com` (ou qualquer e-mail)
3. Senha: escolha uma senha forte
4. Copie o **UID** gerado (ex: `abc123xyz...`)

### 4b. Criar documento na coleção `usuarios`
1. **Firestore Database → Iniciar coleção**
2. ID da coleção: `usuarios`
3. ID do documento: cole o **UID** copiado acima
4. Campos:
   ```
   nome   (string)  → "Admin RA"
   email  (string)  → "admin@pizzaria-ra.com"
   perfil (string)  → "admin"
   ```

---

## Passo 5 — Obter Credenciais do Firebase

1. **Configurações do projeto** (ícone de engrenagem) → **Seus apps**
2. Clique em **"Adicionar app"** → ícone Web `</>`
3. Nome: `pizzaria-ra-web`
4. **NÃO** ative Firebase Hosting (usaremos Netlify)
5. Copie o objeto `firebaseConfig` exibido

---

## Passo 6 — Configurar Credenciais no Projeto

Abra o arquivo `js/firebase.js` e substitua os valores:

```javascript
const firebaseConfig = {
  apiKey:            "AIzaSy...",          // ← sua chave
  authDomain:        "pizzaria-ra.firebaseapp.com",
  projectId:         "pizzaria-ra",
  storageBucket:     "pizzaria-ra.appspot.com",
  messagingSenderId: "123456789",
  appId:             "1:123456789:web:abc..."
};
```

---

## Passo 7 — Aplicar Regras de Segurança

### Opção A — Firebase Console
1. **Firestore Database → Rules**
2. Substitua o conteúdo pelo arquivo `firestore.rules` deste projeto
3. Clique em **"Publicar"**

### Opção B — Firebase CLI
```bash
npm install -g firebase-tools
firebase login
firebase init firestore
firebase deploy --only firestore:rules
```

---

## Passo 8 — Índices Compostos

> ⚠️ **IMPORTANTE — Causa do bug "Carregando produtos..."**
>
> O Firestore exige índices compostos para queries com `orderBy` em
> múltiplos campos. Na versão corrigida do `produtos.js`, a ordenação
> foi movida para o JavaScript, então **não é necessário criar índices
> compostos para produtos**.
>
> Para os pedidos (query com `where` + `orderBy` no mesmo campo
> `dataPedido`), o Firestore cria o índice de campo simples automaticamente.

Se o console do navegador mostrar um erro com um link para criar índice,
clique no link — ele abrirá o Firebase Console com o índice pré-configurado.

---

## Passo 9 — Popolar a Coleção de Produtos

Os produtos existentes no HTML precisam ser cadastrados no Firestore.
Use o painel admin para cadastrá-los, ou importe via script de seed.

### Exemplo de documento na coleção `produtos`:
```json
{
  "nome":      "Pizza Moda da Casa",
  "descricao": "Molho, Presunto, Mussarela, Azeitona, Orégano, Bacon, Calabresa, Milho e Tomate",
  "preco":     33.00,
  "imagem":    "assets/moda.jpeg",
  "categoria": "pizza",
  "estoque":   10,
  "esgotado":  false,
  "ativo":     true,
  "criadoEm":  "<Timestamp>"
}
```

---

## Passo 10 — Deploy no Netlify

O projeto é 100% estático — nenhuma configuração especial é necessária.

1. Faça upload da pasta do projeto no Netlify
   (arrastar a pasta ou conectar ao GitHub)
2. **Build command:** deixar vazio (não há build)
3. **Publish directory:** `/` (raiz do projeto)

---

## Estrutura Final de Arquivos

```
/
├── index.html          ← cardápio (sem alterações no layout)
├── admin.html          ← painel admin com Firebase Auth
├── script.js           ← lógica original do carrinho (preservada)
├── imprimir.html       ← comanda de impressão (sem alterações)
├── firestore.rules     ← regras de segurança (deploy no Firebase)
├── assets/             ← imagens dos produtos
└── js/
    ├── firebase.js     ← ⚠️ CONFIGURAR CREDENCIAIS AQUI
    ├── auth.js         ← Firebase Authentication
    ├── produtos.js     ← Firestore: coleção produtos (ordenação no JS)
    ├── pedidos.js      ← Firestore: coleção pedidos
    ├── admin.js        ← lógica do painel admin
    ├── relatorios.js   ← cálculos de relatórios
    └─ script-firebase-patch.js  ← Firebase + rastreamento de pedido
```

---

## Fluxo de Dados

### Cliente faz pedido:
```
1. Cliente adiciona itens → cart[] (memória)
2. Confirma pedido → script.js chama saveOrderToHistory()
3. script-firebase-patch.js intercepta → chama salvarPedido()
4. salvarPedido() → addDoc(pedidosRef, {...}) → Firestore
5. ID do pedido salvo no localStorage
6. Banner de rastreamento aparece automaticamente
7. WhatsApp é aberto com o texto do pedido
```

### Rastreamento de pedido (NOVO):
```
1. Cliente faz pedido → ID do Firestore salvo no dispositivo
2. onSnapshot() inicia listener no documento do pedido
3. Banner flutuante mostra status atual com barra de progresso
4. Admin muda status no painel → updateDoc() → Firestore
5. onSnapshot() dispara no dispositivo do cliente
6. Banner atualiza em tempo real (Preparando → Saiu → Entregue)
```

### Admin marca produto como esgotado:
```
1. Admin → admin.html → toggle esgotado
2. setEsgotado(id, true) → updateDoc() → Firestore
3. Firestore emite evento via onSnapshot()
4. watchProdutos() recebe lista atualizada → index.html
5. applyEsgotadoFirebase() aplica .esgotado aos cards
6. Botão "Adicionar" desabilitado em tempo real
```

---

## Observações Importantes

- **Sem alteração no layout:** o HTML e CSS do cardápio são preservados.
- **Sem React ou build:** tudo em HTML/CSS/JS puro com ES modules.
- **LocalStorage residual:** apenas o cache de últimos 5 pedidos do
  próprio dispositivo (para o modal de histórico e rastreamento).
- **Compatibilidade Netlify:** deploy direto sem configuração extra.
- **CORS:** Firebase permite requisições de qualquer domínio por padrão.
  Restrinja os domínios autorizados em:
  Firebase Console → Authentication → Settings → Authorized domains.
