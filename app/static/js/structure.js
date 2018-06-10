var example = new Vue({
  el: '#test',
  data: {
    message: 'Hello Vue!'
  }
})



Vue.component('criterio', {
  template: '#tpl_criterio',
  props: {
    model: Object
  },
})

/* NOTE: refer to this example (contains addition, deletion, ...).
 * https://vuejs.org/v2/examples/tree-view.html */
new Vue({
    el: '#tech_lst',
    data: {
        criteri: [
            {
                nome:'A',
                subcriteri: [
                    {nome:'A.1'},
                    {nome:'A.2'},
                    {nome:'A.3'},
                    {nome:'A.4', subcriteri:[{nome:'A.4.I'}]},
                ],
            }, {
                nome:'B',
                subcriteri: [
                    {nome:'B.1'},
                    {
                        nome:'B.2',
                        subcriteri:[
                            {nome:'B.2.I'},
                            {nome:'B.2.II'},
                        ]
                    },
                    {nome:'B.3'},
                ],
            }, {
                nome:'C',
                test: "bla",
            }
        ]
    },
});

//var tech_list = new Vue({
//  el: '#tech_list',
//  data: {
//      criteria: [
//      ]
//  }
//})


//Vue.component('blog-post', {
//  props: ['post'],
//  template: `
//    <div class="blog-post">
//      <h3>{{ post.title }}</h3>
//      <div v-html="post.content"></div>
//    </div>
//  `
//})
