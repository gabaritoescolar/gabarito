/* Configuração do Firebase (login com Google e banco de dados na nuvem).
   Copie do console do Firebase: Configurações do projeto > Seus apps > App da Web > firebaseConfig.
   Enquanto ficar null, o site funciona em modo demonstração, com os dados só no aparelho. */
window.GABARITO_FIREBASE = {
  apiKey: "AIzaSyC_DMnClUXV-nbZDZeEAbSp9hsGx4pCTBo",
  authDomain: "gabarito-escolar.firebaseapp.com",
  projectId: "gabarito-escolar",
  storageBucket: "gabarito-escolar.firebasestorage.app",
  messagingSenderId: "581731656595",
  appId: "1:581731656595:web:7f81625fc1ea5f9e357e66"
};
/* Exemplo:
window.GABARITO_FIREBASE = {
  apiKey: "AIza...",
  authDomain: "gabarito-xxxx.firebaseapp.com",
  projectId: "gabarito-xxxx",
  storageBucket: "gabarito-xxxx.appspot.com",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:0000000000000000"
};
*/

/* Administrador: e-mail Google de quem aprova e remove o acesso dos professores (aba "Acessos").
   Precisa ser o mesmo e-mail escrito nas regras do Firebase (firestore.rules).
   Vazio = o site não pede aprovação. */
window.GABARITO_ADMIN = ["andersonserafimcpv@gmail.com"];
