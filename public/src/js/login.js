import '../styles/login.scss';

var submit = document.querySelector('#submit');
submit.addEventListener('click', function () {
    var name = document.querySelector('#name').value;

    location.href = '/chat?name=' + name;
});
