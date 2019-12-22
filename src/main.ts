/* eslint-disable */
import Vue from "vue"
import VueCompositionApi from '@vue/composition-api';
// Load the CSS reset before the App (which will inject further styles)
import "./reset.css"
// @ts-ignore Load the app's module (TypeScript doesn't recognise .vue so stop it complaining)
import App from "./app"

Vue.use(VueCompositionApi);

new Vue({
  el: "#app",
  components: { App },
  render: (h:any) => h(App)
})
